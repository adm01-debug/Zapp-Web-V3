#!/usr/bin/env bash
# =============================================================================
# deploy-edge.sh — Reconcilia/deploya Edge Functions do Supabase self-hosted
# -----------------------------------------------------------------------------
# Causa-raiz do P0 (REC-ART-04/05): não existia pipeline de deploy de edge
# functions — o volume /home/deno/functions no container supabase_functions é
# a FONTE DA VERDADE em runtime, e o repo driftava (7 STALE / 3 MISSING / 1
# ORPHAN na auditoria phase-04 de 2026-08-05).
#
# Este script compara o repo local (supabase/functions/) com o volume do
# container e classifica cada função:
#   OK      — hash local == hash no volume
#   MISSING — existe no repo, não existe no volume (→ 404 em runtime)
#   STALE   — hash difere (repo mais novo OU hotfix de produção não backportado)
#   ORPHAN  — existe no volume, não existe no repo (higiene; conferir
#             ops.edge_function_registry is_active=false antes de remover)
#
# Padrão da casa (ver .hermes/reconciliation + skill supabase-edge-function-ops):
#   - O acesso ao container é feito por `docker exec` no container do serviço
#     supabase_functions (o runner self-hosted tem /var/run/docker.sock montado
#     — infra/runner/docker-compose.runner.yml) OU, fora do runner, via docker
#     CLI do container docker-housekeeping (que tem o socket docker):
#         docker exec docker-housekeeping_cleanup docker exec <functions> sh -c "..."
#     Selecione com EDGE_EXEC_BACKEND=docker (default) | housekeeping.
#   - Escrita SEMPRE via base64 + validação de hash pós-escrita (nunca sed/cat
#     direto, que corrompe encoding em arquivos com acentos/emojis).
#
# Modos:
#   Sem --apply  → READ-ONLY: imprime o diff e sai com exit 1 se houver
#                  MISSING/STALE/ORPHAN (gate de drift p/ CI).
#   --apply      → Escreve MISSING/STALE (repo → volume), valida hash pós-
#                  escrita e (com --restart) força restart do serviço.
#   --restart    → docker service update --force supabase_functions (exige
#                  socket docker; ignorado se EDGE_EXEC_BACKEND=housekeeping
#                  roda o docker interno do housekeeping).
#
# Uso:
#   bash infra/edge-deploy/deploy-edge.sh                    # drift check
#   bash infra/edge-deploy/deploy-edge.sh --apply            # deploy
#   bash infra/edge-deploy/deploy-edge.sh --apply --restart  # deploy + restart
#
# Env:
#   EDGE_FUNCTIONS_DIR      (default: supabase/functions)
#   EDGE_FUNCTIONS_CONTAINER(default: supabase_functions — prefixo p/ docker ps)
#   EDGE_EXEC_BACKEND       (default: docker | housekeeping)
# =============================================================================
set -euo pipefail

# ── P-01: Configuração ───────────────────────────────────────────────────────
FUNCTIONS_DIR="${EDGE_FUNCTIONS_DIR:-supabase/functions}"
CONTAINER_PREFIX="${EDGE_FUNCTIONS_CONTAINER:-supabase_functions}"
BACKEND="${EDGE_EXEC_BACKEND:-docker}"
VOLUME_PATH="/home/deno/functions"
APPLY=0
RESTART=0

# ── P-02: Parse de argumentos ────────────────────────────────────────────────
for arg in "$@"; do
  case "$arg" in
    --apply)   APPLY=1 ;;
    --restart) RESTART=1 ;;
    -h|--help)
      grep -E '^#( |$)' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) echo "ERRO: argumento desconhecido: $arg (use --apply/--restart/--help)" >&2; exit 2 ;;
  esac
done

# ── P-03: Pré-requisitos locais ──────────────────────────────────────────────
for cmd in sha256sum base64; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "ERRO: comando '$cmd' não encontrado no runner" >&2
    exit 2
  fi
done

if [[ "$BACKEND" == "docker" ]] && ! command -v docker >/dev/null 2>&1; then
  echo "ERRO: docker CLI não encontrado (backend=docker)." >&2
  echo "  No runner self-hosted o socket está em /var/run/docker.sock." >&2
  echo "  Alternativa: EDGE_EXEC_BACKEND=housekeeping (docker dentro do container docker-housekeeping_cleanup)." >&2
  exit 2
fi

# ── P-04: Helper de execução remota no container functions ──────────────────
# Uso: edge_exec "comando sh"  → stdout do container (stderr preservado)
edge_exec() {
  local cmd="$1"
  if [[ "$BACKEND" == "housekeeping" ]]; then
    docker exec docker-housekeeping_cleanup docker exec "$FUNCTIONS_CONTAINER" sh -c "$cmd"
  else
    docker exec "$FUNCTIONS_CONTAINER" sh -c "$cmd"
  fi
}

# Variante com stdin (fix 2026-08-07 — exit 126/E2BIG): funções com index.ts
# >96KB geram base64 >128KB (MAX_ARG_STRLEN) — embutir no argv do sh -c faz o
# kernel rejeitar com "Argument list too long" (docker exec sai 126). Com
# `docker exec -i` o payload trafega pelo stdin (sem limite prático).
edge_exec_stdin() {
  local cmd="$1"
  if [[ "$BACKEND" == "housekeeping" ]]; then
    docker exec docker-housekeeping_cleanup docker exec -i "$FUNCTIONS_CONTAINER" sh -c "$cmd"
  else
    docker exec -i "$FUNCTIONS_CONTAINER" sh -c "$cmd"
  fi
}

# ── P-05: Descobrir o container real (nome com task id, ex: supabase_functions.1.abc) ─
echo "── P-05: localizando container '$CONTAINER_PREFIX' (backend=$BACKEND) ──"
if [[ "$BACKEND" == "housekeeping" ]]; then
  FUNCTIONS_CONTAINER=$(docker exec docker-housekeeping_cleanup \
    docker ps --filter "name=${CONTAINER_PREFIX}" --format '{{.Names}}' | head -1 || true)
else
  FUNCTIONS_CONTAINER=$(docker ps --filter "name=${CONTAINER_PREFIX}" --format '{{.Names}}' | head -1 || true)
fi
if [[ -z "${FUNCTIONS_CONTAINER:-}" ]]; then
  echo "ERRO: container '${CONTAINER_PREFIX}' não encontrado (docker ps)." >&2
  echo "  Confirme EDGE_FUNCTIONS_CONTAINER ou rode no host/runner com o stack supabase ativo." >&2
  exit 1
fi
echo "  → container: $FUNCTIONS_CONTAINER"

# ── P-06: Lista de funções do repo (dirs com index.ts) ───────────────────────
if [[ ! -d "$FUNCTIONS_DIR" ]]; then
  echo "ERRO: diretório '$FUNCTIONS_DIR' não encontrado (rode da raiz do repo)." >&2
  exit 2
fi
mapfile -t REPO_FNS < <(find "$FUNCTIONS_DIR" -mindepth 2 -maxdepth 2 -name index.ts -printf '%h\n' | xargs -n1 basename | sort)
echo "  repo: ${#REPO_FNS[@]} funções com index.ts"

# ── P-07: Snapshot remoto (lista + hashes do volume, 1 chamada) ──────────────
echo "── P-07: snapshot do volume ${VOLUME_PATH} ──"
REMOTE_SNAPSHOT=$(edge_exec "
  for d in ${VOLUME_PATH}/*/; do
    [ -f \"\$d/index.ts\" ] && echo \"\$(basename \"\$d\") \$(sha256sum \"\$d/index.ts\" | cut -c1-12)\"
  done
" 2>/dev/null || true)

declare -A REMOTE_HASH
declare -A REMOTE_FNS
REMOTE_COUNT=0
while read -r name hash; do
  [[ -z "$name" ]] && continue
  REMOTE_HASH["$name"]="$hash"
  REMOTE_FNS["$name"]=1
  REMOTE_COUNT=$((REMOTE_COUNT+1))
done <<< "$REMOTE_SNAPSHOT"
echo "  volume: ${REMOTE_COUNT} funções com index.ts"

# ── P-08: Classificação OK / MISSING / STALE / ORPHAN ────────────────────────
OK=0; MISSING=0; STALE=0; ORPHAN=0
declare -a MISSING_LIST STALE_LIST ORPHAN_LIST

for fn in "${REPO_FNS[@]}"; do
  local_hash=$(sha256sum "$FUNCTIONS_DIR/$fn/index.ts" | cut -c1-12)
  if [[ -z "${REMOTE_HASH[$fn]:-}" ]]; then
    MISSING=$((MISSING+1)); MISSING_LIST+=("$fn")
  elif [[ "${REMOTE_HASH[$fn]}" != "$local_hash" ]]; then
    STALE=$((STALE+1)); STALE_LIST+=("$fn")
  else
    OK=$((OK+1))
  fi
done

for name in "${!REMOTE_FNS[@]}"; do
  if ! printf '%s\n' "${REPO_FNS[@]}" | grep -qx "$name"; then
    ORPHAN=$((ORPHAN+1)); ORPHAN_LIST+=("$name")
  fi
done

# ── P-09: Relatório ──────────────────────────────────────────────────────────
echo
echo "════════════ EDGE FUNCTION DRIFT REPORT ════════════"
echo "  OK      : $OK"
echo "  MISSING : $MISSING  (repo sem deploy → 404 em runtime)"
if (( MISSING > 0 )); then
  for fn in ${MISSING_LIST[@]+"${MISSING_LIST[@]}"}; do echo "    MISSING  $fn"; done
fi
echo "  STALE   : $STALE  (hash difere)"
if (( STALE > 0 )); then
  for fn in ${STALE_LIST[@]+"${STALE_LIST[@]}"}; do
    echo "    STALE    $fn  deploy=${REMOTE_HASH[$fn]} repo=$(sha256sum "$FUNCTIONS_DIR/$fn/index.ts" | cut -c1-12)"
  done
fi
echo "  ORPHAN  : $ORPHAN  (volume sem repo — conferir registry antes de remover)"
if (( ORPHAN > 0 )); then
  for fn in ${ORPHAN_LIST[@]+"${ORPHAN_LIST[@]}"}; do echo "    ORPHAN   $fn  deploy=${REMOTE_HASH[$fn]}"; done
fi
echo "════════════════════════════════════════════════════"
echo "  container: $FUNCTIONS_CONTAINER · backend: $BACKEND · mode: $([ $APPLY -eq 1 ] && echo APPLY || echo READ-ONLY)"
echo

# ── P-10: Modo apply (escrita via base64 + validação pós-escrita) ───────────
if [[ $APPLY -eq 1 ]] && { [[ $MISSING -gt 0 || $STALE -gt 0 ]]; }; then
  echo "── P-10: aplicando deploy (repo → volume) ──"
  for fn in "${MISSING_LIST[@]}" "${STALE_LIST[@]}"; do
    b64=$(base64 -w0 "$FUNCTIONS_DIR/$fn/index.ts")
    expected=$(sha256sum "$FUNCTIONS_DIR/$fn/index.ts" | cut -c1-12)
    # Fix 2026-08-07 (exit 126/E2BIG): payload via stdin (docker exec -i) —
    # argv do sh -c estoura MAX_ARG_STRLEN com index.ts >96KB.
    echo "$b64" | edge_exec_stdin "
      mkdir -p ${VOLUME_PATH}/${fn}
      base64 -d > ${VOLUME_PATH}/${fn}/index.ts
    " >/dev/null 2>&1
    # P-10a: validação de hash pós-escrita (anti-corrupção de encoding)
    written=$(edge_exec "sha256sum ${VOLUME_PATH}/${fn}/index.ts" 2>/dev/null | cut -c1-12 || true)
    if [[ "$written" == "$expected" ]]; then
      echo "  ✅ $fn  → $expected (hash pós-escrita OK)"
    else
      echo "  ❌ $fn  → escrita FALHOU (esperado=$expected, escrito=$written)" >&2
      exit 1
    fi
  done
  echo "── P-10 concluído ──"
elif [[ $APPLY -eq 1 ]]; then
  echo "── P-10: nada a aplicar (sem MISSING/STALE) ──"
fi

# ── P-11: Restart do serviço (opcional) ──────────────────────────────────────
if [[ $RESTART -eq 1 && ( $APPLY -eq 1 ) && ( $MISSING -gt 0 || $STALE -gt 0 ) ]]; then
  echo "── P-11: restart supabase_functions (docker service update --force) ──"
  if [[ "$BACKEND" == "housekeeping" ]]; then
    docker exec docker-housekeeping_cleanup docker service update --force supabase_functions
  else
    docker service update --force supabase_functions
  fi
  echo "  ✅ restart disparado"
fi

# ── P-12: Exit code — drift sem --apply falha (gate de CI) ───────────────────
if [[ $MISSING -gt 0 || $STALE -gt 0 || $ORPHAN -gt 0 ]]; then
  if [[ $APPLY -eq 0 ]]; then
    echo "❌ DRIFT detectado (MISSING=$MISSING STALE=$STALE ORPHAN=$ORPHAN) — rode com --apply para reconciliar." >&2
    exit 1
  fi
  # Com --apply: MISSING/STALE foram resolvidos; ORPHAN é higiene (não bloqueia).
  if [[ $ORPHAN -gt 0 ]]; then
    echo "⚠️  ORPHAN restante ($ORPHAN) — higiene manual: conferir ops.edge_function_registry antes de remover do volume."
  fi
fi

# ── P-13: Sincronização do _shared/ (fix P0 2026-08-07) ───────────────────────
# GAP DESCOBERTO NA ONDA DE VALIDAÇÃO: o deploy sincronizava SOMENTE os
# index.ts — o _shared/ (contract-kit, contract-schemas, webhook-schemas, etc.)
# nunca era copiado → volume stale (ex.: contract-kit sem contractViolation422,
# CONTRACT_SCHEMAS sem mcp-query → 422 'schema ausente' em runtime).
# Agora: snapshot → diff → apply (base64 via stdin, hash pós-escrita) de TODOS
# os arquivos .ts do _shared/ do repo.
SHARED_DIR="$FUNCTIONS_DIR/_shared"
SHARED_OK=0; SHARED_MISSING=0; SHARED_STALE=0
declare -a SHARED_MISSING_LIST SHARED_STALE_LIST

if [[ -d "$SHARED_DIR" ]]; then
  mapfile -t REPO_SHARED < <(find "$SHARED_DIR" -maxdepth 1 -name '*.ts' -printf '%f\n' | sort)
  # Snapshot remoto: "nome hash" por arquivo (1 chamada)
  REMOTE_SHARED_SNAPSHOT=$(edge_exec "
    for f in ${VOLUME_PATH}/_shared/*.ts; do
      [ -f \"\$f\" ] && echo \"\$(basename \"\$f\") \$(sha256sum \"\$f\" | cut -c1-12)\"
    done
  " 2>/dev/null || true)
  declare -A REMOTE_SHARED_HASH
  while read -r name hash; do
    [[ -z "$name" ]] && continue
    REMOTE_SHARED_HASH["$name"]="$hash"
  done <<< "$REMOTE_SHARED_SNAPSHOT"

  for f in "${REPO_SHARED[@]}"; do
    local_hash=$(sha256sum "$SHARED_DIR/$f" | cut -c1-12)
    if [[ -z "${REMOTE_SHARED_HASH[$f]:-}" ]]; then
      SHARED_MISSING=$((SHARED_MISSING+1)); SHARED_MISSING_LIST+=("$f")
    elif [[ "${REMOTE_SHARED_HASH[$f]}" != "$local_hash" ]]; then
      SHARED_STALE=$((SHARED_STALE+1)); SHARED_STALE_LIST+=("$f")
    else
      SHARED_OK=$((SHARED_OK+1))
    fi
  done

  echo
  echo "════════════ _SHARED DRIFT REPORT ════════════"
  echo "  OK      : $SHARED_OK"
  echo "  MISSING : $SHARED_MISSING"
  if (( SHARED_MISSING > 0 )); then
    for f in ${SHARED_MISSING_LIST[@]+"${SHARED_MISSING_LIST[@]}"}; do echo "    MISSING  _shared/$f"; done
  fi
  echo "  STALE   : $SHARED_STALE"
  if (( SHARED_STALE > 0 )); then
    for f in ${SHARED_STALE_LIST[@]+"${SHARED_STALE_LIST[@]}"}; do
      echo "    STALE    _shared/$f  deploy=${REMOTE_SHARED_HASH[$f]} repo=$(sha256sum "$SHARED_DIR/$f" | cut -c1-12)"
    done
  fi
  echo "═════════════════════════════════════════════"

  if [[ $APPLY -eq 1 ]] && { [[ $SHARED_MISSING -gt 0 || $SHARED_STALE -gt 0 ]]; }; then
    echo "── P-13: aplicando _shared/ (repo → volume) ──"
    for f in "${SHARED_MISSING_LIST[@]}" "${SHARED_STALE_LIST[@]}"; do
      b64=$(base64 -w0 "$SHARED_DIR/$f")
      expected=$(sha256sum "$SHARED_DIR/$f" | cut -c1-12)
      echo "$b64" | edge_exec_stdin "
        mkdir -p ${VOLUME_PATH}/_shared
        base64 -d > ${VOLUME_PATH}/_shared/$f
      " >/dev/null 2>&1
      written=$(edge_exec "sha256sum ${VOLUME_PATH}/_shared/$f" 2>/dev/null | cut -c1-12 || true)
      if [[ "$written" == "$expected" ]]; then
        echo "  ✅ _shared/$f → $expected (hash pós-escrita OK)"
      else
        echo "  ❌ _shared/$f → escrita FALHOU (esperado=$expected, escrito=$written)" >&2
        exit 1
      fi
    done
    echo "── P-13 concluído ──"
  elif [[ $APPLY -eq 1 ]]; then
    echo "── P-13: _shared/ sem drift ──"
  fi

  # Gate: drift de _shared sem --apply também falha (mesma semântica do P-12)
  if [[ $APPLY -eq 0 ]] && { [[ $SHARED_MISSING -gt 0 || $SHARED_STALE -gt 0 ]]; }; then
    echo "❌ _SHARED DRIFT detectado (MISSING=$SHARED_MISSING STALE=$SHARED_STALE) — rode com --apply." >&2
    exit 1
  fi
else
  echo "⚠️  _shared/ ausente no repo ($SHARED_DIR) — pulando sincronização."
fi
echo "✅ deploy-edge: concluído sem erros."
