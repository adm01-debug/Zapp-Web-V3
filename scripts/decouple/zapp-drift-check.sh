#!/bin/sh
# zapp-drift-check.sh - gate de drift do schema zapp (I7, lado zapp)
# Compara o schema zapp REAL de producao com o snapshot commitado em
# scripts/decouple/snapshots/zapp_schema_snapshot.sql. Falha (exit 1) se divergir.
# Fluxo legitimo: commitar a migration E regenerar o snapshot no mesmo PR
# (REGEN=1 sh scripts/decouple/zapp-drift-check.sh; commitar o resultado).
# Requisitos: docker socket (runner vps-zapp) + servico supabase_db no Swarm.
set -eu
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SNAPSHOT="$REPO_ROOT/scripts/decouple/snapshots/zapp_schema_snapshot.sql"
TRANSFORM="$REPO_ROOT/scripts/decouple/schema-snapshot-transform.mjs"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT INT TERM

DB_CTN="$(docker ps --filter name=supabase_db --format '{{.Names}}' | head -1)"
[ -n "$DB_CTN" ] || { echo 'ERRO: container supabase_db nao encontrado'; exit 2; }

echo "[zapp-drift] dump do schema zapp via $DB_CTN"
docker exec "$DB_CTN" sh -c 'PGPASSWORD=$(cat /run/secrets/supabase_db_password_v1) pg_dump -U supabase_admin -d postgres -n zapp --schema-only --no-owner --no-privileges' > "$WORK/dump.sql"
[ -s "$WORK/dump.sql" ] || { echo 'ERRO: dump vazio'; exit 2; }

echo '[zapp-drift] transformando (mesmas regras da baseline E41)'
NODE_BIN="$([ -x /actions-runner/externals/node20/bin/node ] && echo /actions-runner/externals/node20/bin/node || command -v node)"
"$NODE_BIN" "$TRANSFORM" "$WORK/dump.sql" "$WORK/snap-raw.sql" > /dev/null

grep -v '^--' "$WORK/snap-raw.sql" | sed '/./,$!d' > "$WORK/snapshot-fresh.sql"

if [ "${REGEN:-0}" = "1" ]; then
  cp "$WORK/snapshot-fresh.sql" "$SNAPSHOT"
  echo "[zapp-drift] snapshot regenerado em $SNAPSHOT - revise e commite"
  exit 0
fi

if diff -u "$SNAPSHOT" "$WORK/snapshot-fresh.sql" > "$WORK/drift.diff"; then
  echo '[zapp-drift] OK - schema zapp de producao == snapshot commitado'
else
  echo '[zapp-drift] DRIFT DETECTADO - schema zapp de producao diverge do snapshot:'
  head -120 "$WORK/drift.diff"
  echo '...'
  echo "Total: $(grep -c '^[+-]' "$WORK/drift.diff") linhas divergentes."
  echo 'Causa: DDL sem migration neste repo (viola I7), ou migration sem regen do snapshot.'
  exit 1
fi
