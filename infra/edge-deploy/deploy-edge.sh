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
#             ops.edge_function_registry is_active=false antes de remover).
#             No _shared/ vale para QUALQUER arquivo regular do volume fora
#             das exclusões (__tests__/, __fixtures__/, *.test.ts, *.spec.ts)
#             que não exista no repo — inclusive lixo sem extensão .ts
#             (fix 2026-08-15: o snapshot remoto lista todos os arquivos
#             regulares, não só *.ts).
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
#   - _shared/ é sincronizado de forma RECURSIVA desde 2026-08-14 (fix P0):
#     todos os .ts sob supabase/functions/_shared/** (ex.: providers/,
#     providers/evolution/, providers/fake/, domain/) entram no diff
#     MISSING/STALE por hash, com a mesma semântica das functions; os
#     diretórios __tests__/ e __fixtures__/ e os arquivos *.test.ts / *.spec.ts
#     são EXCLUÍDOS do sync (testes/fixtures não vão para produção). A chave
#     do diff é o caminho RELATIVO a _shared/ (basename colidiria, ex.:
#     providers/evolution/index.ts × providers/fake/index.ts).
#   - Órfãos de _shared (arquivo regular no volume, ausente do repo, fora das
#     exclusões) são DETECTADOS desde 2026-08-15: read-only reporta e sai com
#     exit 1 (fecha o gate E39); --apply NÃO os remove — apenas --prune.
#
# Modos:
#   Sem --apply  → READ-ONLY: imprime o diff e sai com exit 1 se houver
#                  MISSING/STALE/ORPHAN (gate de drift p/ CI — E39).
#   --apply      → Escreve MISSING/STALE (repo → volume), valida hash pós-
#                  escrita e (com --restart) força restart do serviço.
#   --prune      → (com --apply) remove os ORPHANs de _shared do volume
#                  (arquivos fora das exclusões que só existem no volume).
#   --restart    → docker service update --force supabase_functions (exige
#                  socket docker; ignorado se EDGE_EXEC_BACKEND=housekeeping
#                  roda o docker interno do housekeeping). Dispara SEMPRE que
#                  algo foi escrito/removido no volume (functions OU _shared
#                  OU --prune), DEPOIS de todas as escritas (fix 2026-08-15 —
#                  antes o restart ficava antes do sync do _shared e não
#                  disparava quando só o _shared mudava).
#
# Uso:
#   bash infra/edge-deploy/deploy-edge.sh                    # drift check
#   bash infra/edge-deploy/deploy-edge.sh --apply            # deploy
#   bash infra/edge-deploy/deploy-edge.sh --apply --prune    # deploy + remove órfãos de _shared
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
PRUNE=0
RESTART=0

# ── P-02: Parse de argumentos ────────────────────────────────────────────────
for arg in "$@"; do
  case "$arg" in
    --apply)   APPLY=1 ;;
    --prune)   PRUNE=1 ;;
    --restart) RESTART=1 ;;
    -h|--help)
      grep -E '^#( |$)' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) echo "ERRO: argumento desconhecido: $arg (use --apply/--prune/--restart/--help)" >&2; exit 2 ;;
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
    [ -f \"\$d/index.ts\" ] && printf '%s\t%s\n' \"\$(basename \"\$d\")\" \"\$(sha256sum \"\$d/index.ts\" | cut -c1-12)\"
  done
" 2>/dev/null || true)

declare -A REMOTE_HASH
declare -A REMOTE_FNS
REMOTE_COUNT=0
while IFS=$'\t' read -r name hash; do
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
      mkdir -p \"${VOLUME_PATH}/${fn}\"
      base64 -d > \"${VOLUME_PATH}/${fn}/index.ts\"
    " >/dev/null 2>&1
    # P-10a: validação de hash pós-escrita (anti-corrupção de encoding)
    written=$(edge_exec "sha256sum \"${VOLUME_PATH}/${fn}/index.ts\"" 2>/dev/null | cut -c1-12 || true)
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

# ── P-12: Exit code — drift sem --apply falha (gate de CI) ───────────────────
if [[ $MISSING -gt 0 || $STALE -gt 0 || $ORPHAN -gt 0 ]]; then
  if [[ $APPLY -eq 0 ]]; then
    echo "❌ DRIFT detectado (MISSING=$MISSING STALE=$STALE ORPHAN=$ORPHAN) — rode com --apply para reconciliar." >&2
    exit 1
  fi
  # Com --apply: MISSING/STALE foram resolvidos; ORPHAN de functions é higiene
  # manual (não bloqueia); ORPHAN de _shared é tratado em P-13/P-13b (--prune).
  if [[ $ORPHAN -gt 0 ]]; then
    echo "⚠️  ORPHAN de functions restante ($ORPHAN) — higiene manual: conferir ops.edge_function_registry antes de remover do volume."
  fi
fi

# ── P-13: Sincronização do _shared/ (fix P0 2026-08-07; recursivo 2026-08-14) ─
# GAP DESCOBERTO NA ONDA DE VALIDAÇÃO: o deploy sincronizava SOMENTE os
# index.ts — o _shared/ (contract-kit, contract-schemas, webhook-schemas, etc.)
# nunca era copiado → volume stale (ex.: contract-kit sem contractViolation422,
# CONTRACT_SCHEMAS sem mcp-query → 422 'schema ausente' em runtime).
# Agora: snapshot → diff → apply (base64 via stdin, hash pós-escrita) de TODOS
# os arquivos .ts do _shared/ do repo.
# Fix 2026-08-14 (BUG P0 — sync só da raiz): o loop antigo usava
# `${VOLUME_PATH}/_shared/*.ts` (globo só do nível 1) → subdiretórios
# (providers/, providers/evolution/, providers/fake/, domain/) NUNCA eram
# sincronizados (evidência: providers/registry.ts V2 stale no volume vs V3 no
# repo; providers/fake/ nem existe no runtime). Agora o find é RECURSIVO e a
# chave do diff passou de basename para caminho relativo a _shared/ (basename
# colidiria, ex.: providers/evolution/index.ts × providers/fake/index.ts).
# Excluídos do sync (testes/fixtures não vão para produção): __tests__/,
# __fixtures__/, *.test.ts, *.spec.ts.
SHARED_DIR="$FUNCTIONS_DIR/_shared"
SHARED_OK=0; SHARED_MISSING=0; SHARED_STALE=0; SHARED_ORPHAN=0
PRUNED=0
declare -a SHARED_MISSING_LIST SHARED_STALE_LIST

if [[ -d "$SHARED_DIR" ]]; then
  # Lista recursiva dos .ts do repo, como caminho RELATIVO a _shared/
  # (ex.: providers/registry.ts) — exclui testes/fixtures (não vão a produção).
  mapfile -t REPO_SHARED < <(
    find "$SHARED_DIR" -type f -name '*.ts' \
      ! -path '*/__tests__/*' \
      ! -path '*/__fixtures__/*' \
      ! -name '*.test.ts' \
      ! -name '*.spec.ts' \
      -printf '%P\n' | sort
  )
  # Snapshot remoto RECURSIVO: "caminho_relativo<TAB>hash" por arquivo (1
  # chamada). Fix 2026-08-15 (BUG-1/3): saída TAB-delimitada (path com ESPAÇO
  # não quebra o parse) e TODOS os arquivos regulares, não só *.ts (lixo sem
  # extensão fica visível e entra na detecção de órfão).
  REMOTE_SHARED_SNAPSHOT=$(edge_exec "
    find ${VOLUME_PATH}/_shared -type f 2>/dev/null | sort | while IFS= read -r f; do
      [ -f \"\$f\" ] && printf '%s\t%s\n' \"\${f#${VOLUME_PATH}/_shared/}\" \"\$(sha256sum \"\$f\" | cut -c1-12)\"
    done
  " 2>/dev/null || true)
  declare -A REMOTE_SHARED_HASH
  declare -A REMOTE_SHARED_FNS
  while IFS=$'\t' read -r name hash; do
    [[ -z "$name" ]] && continue
    REMOTE_SHARED_HASH["$name"]="$hash"
    REMOTE_SHARED_FNS["$name"]=1
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

  # Órfãos de _shared (BUG-2, fix 2026-08-15): arquivo regular no volume,
  # ausente do repo e FORA das exclusões (testes/fixtures no volume ficam
  # fora do escopo do sync — não são órfãos nem são prunados).
  for name in "${!REMOTE_SHARED_FNS[@]}"; do
    case "/$name" in
      */__tests__/*|*/__fixtures__/*) continue ;;
    esac
    case "${name##*/}" in
      *.test.ts|*.spec.ts) continue ;;
    esac
    if ! printf '%s\n' "${REPO_SHARED[@]}" | grep -qx "$name"; then
      SHARED_ORPHAN=$((SHARED_ORPHAN+1)); SHARED_ORPHAN_LIST+=("$name")
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
  echo "  ORPHAN  : $SHARED_ORPHAN  (volume sem repo, fora das exclusões — --apply --prune remove)"
  if (( SHARED_ORPHAN > 0 )); then
    for f in ${SHARED_ORPHAN_LIST[@]+"${SHARED_ORPHAN_LIST[@]}"}; do
      echo "    ORPHAN   _shared/$f  deploy=${REMOTE_SHARED_HASH[$f]}"
    done
  fi
  echo "═════════════════════════════════════════════"

  if [[ $APPLY -eq 1 ]] && { [[ $SHARED_MISSING -gt 0 || $SHARED_STALE -gt 0 ]]; }; then
    echo "── P-13: aplicando _shared/ (repo → volume) ──"
    for f in "${SHARED_MISSING_LIST[@]}" "${SHARED_STALE_LIST[@]}"; do
      b64=$(base64 -w0 "$SHARED_DIR/$f")
      expected=$(sha256sum "$SHARED_DIR/$f" | cut -c1-12)
      # fdir = subdiretório do arquivo relativo a _shared/ (ex.: providers/
      # evolution); arquivos da raiz caem em fdir="." (mkdir -p .../_shared/.
      # é no-op seguro quando _shared/ já existe).
      fdir="${f%/*}"
      [[ "$fdir" == "$f" ]] && fdir="."
      echo "$b64" | edge_exec_stdin "
        mkdir -p \"${VOLUME_PATH}/_shared/${fdir}\"
        base64 -d > \"${VOLUME_PATH}/_shared/${f}\"
      " >/dev/null 2>&1
      written=$(edge_exec "sha256sum \"${VOLUME_PATH}/_shared/${f}\"" 2>/dev/null | cut -c1-12 || true)
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

  # P-13b: remoção de órfãos SÓ com --apply --prune (fix BUG-2 2026-08-15 —
  # --apply sozinho NUNCA remove arquivo do volume).
  if [[ $APPLY -eq 1 ]] && [[ $SHARED_ORPHAN -gt 0 ]] && [[ $PRUNE -eq 1 ]]; then
    echo "── P-13b: removendo órfãos de _shared (--prune) ──"
    for name in "${SHARED_ORPHAN_LIST[@]}"; do
      edge_exec "rm -f \"${VOLUME_PATH}/_shared/${name}\"" >/dev/null 2>&1 || true
      if ! edge_exec "[ -e \"${VOLUME_PATH}/_shared/${name}\" ]" 2>/dev/null; then
        echo "  🗑️  _shared/$name removido"
        PRUNED=$((PRUNED+1))
      else
        echo "  ❌ _shared/$name: falha ao remover do volume" >&2
        exit 1
      fi
    done
    echo "── P-13b concluído ($PRUNED removidos) ──"
  fi

  # Gate: drift de _shared sem --apply também falha (mesma semântica do P-12;
  # ORPHAN de _shared entra no gate desde 2026-08-15 — fecha E39).
  if [[ $APPLY -eq 0 ]] && { [[ $SHARED_MISSING -gt 0 || $SHARED_STALE -gt 0 || $SHARED_ORPHAN -gt 0 ]]; }; then
    echo "❌ _SHARED DRIFT detectado (MISSING=$SHARED_MISSING STALE=$SHARED_STALE ORPHAN=$SHARED_ORPHAN) — rode com --apply (órfãos: --prune)." >&2
    exit 1
  fi
  if [[ $APPLY -eq 1 ]] && [[ $SHARED_ORPHAN -gt 0 ]] && [[ $PRUNE -eq 0 ]]; then
    echo "⚠️  ORPHAN de _shared restante ($SHARED_ORPHAN) — use --apply --prune para removê-los do volume." >&2
  fi
else
  echo "⚠️  _shared/ ausente no repo ($SHARED_DIR) — pulando sincronização."
fi

# ── P-14: Restart do serviço (opcional) ──────────────────────────────────────
# Fix 2026-08-15 (BUG-4): o restart morava no antigo P-11 — rodava ANTES do
# sync do _shared (P-13) e só disparava com drift de functions; quando SOMENTE
# o _shared mudava, o edge-runtime continuava servindo o módulo em cache (gap
# do commit 4151e93ec). Agora roda DEPOIS de todas as escritas/remoções e
# cobre functions + _shared + --prune.
if [[ $RESTART -eq 1 && $APPLY -eq 1 ]] && { [[ $MISSING -gt 0 || $STALE -gt 0 || $SHARED_MISSING -gt 0 || $SHARED_STALE -gt 0 || $PRUNED -gt 0 ]]; }; then
  echo "── P-14: restart supabase_functions (docker service update --force) ──"
  if [[ "$BACKEND" == "housekeeping" ]]; then
    docker exec docker-housekeeping_cleanup docker service update --force supabase_functions
  else
    docker service update --force supabase_functions
  fi
  echo "  ✅ restart disparado"
fi
echo "✅ deploy-edge: concluído sem erros."
