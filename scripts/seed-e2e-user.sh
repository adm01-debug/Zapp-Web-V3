#!/usr/bin/env bash
# Semeia o usuário E2E com permissões de CRM na VPS Supabase Self-Hosted.
#
# Uso:
#   SUPABASE_DB_URL=postgres://... \
#   E2E_USER_EMAIL=e2e-bot@zappweb.test \
#   E2E_USER_PASSWORD=change-me-in-ci \
#   ./scripts/seed-e2e-user.sh
#
# Idempotente. Seguro para rodar antes de cada suite E2E.

set -euo pipefail

: "${SUPABASE_DB_URL:?defina SUPABASE_DB_URL (postgres://user:pass@host:5432/postgres)}"
: "${E2E_USER_EMAIL:?defina E2E_USER_EMAIL}"
: "${E2E_USER_PASSWORD:?defina E2E_USER_PASSWORD}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SUMMARY_JSON="${SEED_REPORT_JSON:-/tmp/seed-e2e-user-summary.json}"
LOG_FILE="${SEED_REPORT_LOG:-/tmp/seed-e2e-user.log}"

echo "[seed-e2e] usuário: $E2E_USER_EMAIL"

# psql envia NOTICE para stderr; capturamos ambos para extrair o marcador.
set +e
psql "$SUPABASE_DB_URL" \
  --set=ON_ERROR_STOP=on \
  --set=email="'${E2E_USER_EMAIL//\'/\'\'}'" \
  --set=password="'${E2E_USER_PASSWORD//\'/\'\'}'" \
  -f "$SCRIPT_DIR/seed-e2e-user.sql" > >(tee -a "$LOG_FILE") 2> >(tee -a "$LOG_FILE" >&2)
rc=$?
set -e

if [ $rc -ne 0 ]; then
  echo "[seed-e2e] ❌ psql exit=$rc — veja $LOG_FILE" >&2
  exit $rc
fi

# Extrai a última linha "E2E_SEED_SUMMARY_JSON:{...}"
if grep -q 'E2E_SEED_SUMMARY_JSON:' "$LOG_FILE"; then
  grep 'E2E_SEED_SUMMARY_JSON:' "$LOG_FILE" | tail -n1 | sed 's/^.*E2E_SEED_SUMMARY_JSON://' > "$SUMMARY_JSON"
  echo "[seed-e2e] summary → $SUMMARY_JSON"
  cat "$SUMMARY_JSON"; echo
else
  echo "[seed-e2e] ⚠️  marcador E2E_SEED_SUMMARY_JSON não encontrado no log" >&2
  echo '{"kind":"user","warning":"summary-not-emitted"}' > "$SUMMARY_JSON"
fi

echo "[seed-e2e] OK — usuário pronto para E2E de CRM."

