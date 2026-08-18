#!/usr/bin/env bash
# Aplica migrations pendentes do repo no Supabase self-hosted da VPS.
#
# Causa-raiz do incidente 2026-08-18: 19 migrations commitadas (fluxo
# Lovable GitHub-first) nunca aplicadas no self-hosted -> drift repo x DB
# com 400/404 no front (RPCs inexistentes/quebradas). Este aplicador fecha
# a classe do problema: todo push em main que toque supabase/migrations/**
# aplica o que falta e registra em supabase_migrations.schema_migrations.
#
# Requisitos: runner self-hosted da VPS com /var/run/docker.sock (mesmo
# padrao do infra/edge-deploy). Aplica via `docker exec supabase_db psql
# -U postgres` (auth peer no socket local; credencial nunca sai do container).
#
# Regras:
#  - BASELINE 20260817000000: tudo anterior esta consolidado no squash
#    canonico 20260804000000 + versoes historicas ja registradas; arquivos
#    antigos NUNCA sao (re)aplicados por este script.
#  - Versao do arquivo DEVE ser ^[0-9]{14}$ (mata a classe "20260817E25").
#  - pending = versao ausente em supabase_migrations.schema_migrations.
#  - Aplica em ordem lexicografica, um por vez, psql -1 -v ON_ERROR_STOP=1;
#    arquivo com CONCURRENTLY roda sem -1 (nao pode em transacao). Para no
#    primeiro erro (exit 1) sem registrar a migration que falhou.
#    NOTA: arquivo com BEGIN/COMMIT proprio + erro DEPOIS do COMMIT interno
#    nao desfaz o que ja commitou (mesma semantica do psql).
#  - Apos aplicar, recarrega o schema cache do PostgREST via SIGUSR1 no
#    container supabase_rest (NOTIFY pgrst nao surte efeito neste stack).
#  - DRY_RUN=1: so lista o plano, nao aplica nada.
set -euo pipefail

BASELINE="20260817000000"
MIG_DIR="supabase/migrations"
DRY_RUN="${DRY_RUN:-0}"

DB_CID=$(docker ps --filter name=supabase_db -q | head -1)
[ -n "$DB_CID" ] || { echo "::error::container supabase_db nao encontrado"; exit 1; }

psql_db() { docker exec -i "$DB_CID" psql -U postgres -d postgres "$@"; }

applied=$(psql_db -tAc "SELECT version FROM supabase_migrations.schema_migrations WHERE version >= '$BASELINE'")

plan=()
for f in "$MIG_DIR"/[0-9]*.sql; do
  base=$(basename "$f" .sql)
  ver="${base%%_*}"
  name="${base#*_}"
  [ "$ver" \< "$BASELINE" ] && continue
  if ! printf '%s' "$ver" | grep -qE '^[0-9]{14}$'; then
    echo "::error::versao invalida no nome de migration: $base (esperado 14 digitos)"
    exit 1
  fi
  if ! printf '%s' "$name" | grep -qE '^[A-Za-z0-9_-]+$'; then
    echo "::error::nome de migration com caracteres fora de [A-Za-z0-9_-]: $base"
    exit 1
  fi
  if ! printf '%s\n' "$applied" | grep -qx "$ver"; then
    plan+=("$f")
  fi
done

if [ "${#plan[@]}" -eq 0 ]; then
  echo "Nenhuma migration pendente (baseline $BASELINE). Repo e banco alinhados."
  exit 0
fi

echo "Migrations pendentes (${#plan[@]}):"
printf '  %s\n' "${plan[@]}"

if [ "$DRY_RUN" = "1" ]; then
  echo "DRY_RUN=1 - nada aplicado."
  exit 0
fi

count=0
for f in "${plan[@]}"; do
  base=$(basename "$f" .sql); ver="${base%%_*}"; name="${base#*_}"
  echo "==> aplicando $base"
  if grep -qi 'CONCURRENTLY' "$f"; then
    psql_db -v ON_ERROR_STOP=1 -f - < "$f"
  else
    psql_db -1 -v ON_ERROR_STOP=1 -f - < "$f"
  fi
  psql_db -v ON_ERROR_STOP=1 -tAc "INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('$ver', '$name') ON CONFLICT (version) DO NOTHING" >/dev/null
  count=$((count+1))
done

echo "Aplicadas: $count. Recarregando schema cache do PostgREST (SIGUSR1)..."
REST_CID=$(docker ps --filter name=supabase_rest -q | head -1)
if [ -n "$REST_CID" ]; then
  docker kill --signal=SIGUSR1 "$REST_CID" >/dev/null && echo "PostgREST schema cache reload disparado."
else
  echo "::warning::container supabase_rest nao encontrado - reload de schema cache pulado."
fi
echo "OK."
