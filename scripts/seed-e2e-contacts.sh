#!/usr/bin/env bash
# Aplica o seed idempotente de contatos E2E.
#
# Env:
#   SUPABASE_DB_URL - conexão postgres (owner de zapp)
#
# Uso: SUPABASE_DB_URL=... ./scripts/seed-e2e-contacts.sh

set -euo pipefail

: "${SUPABASE_DB_URL:?SUPABASE_DB_URL é obrigatório}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SQL_FILE="${SCRIPT_DIR}/seed-e2e-contacts.sql"
SUMMARY_JSON="${SEED_REPORT_JSON:-/tmp/seed-e2e-contacts-summary.json}"
LOG_FILE="${SEED_REPORT_LOG:-/tmp/seed-e2e-contacts.log}"

[ -f "$SQL_FILE" ] || { echo "::error::SQL não encontrado: $SQL_FILE" >&2; exit 2; }

echo "→ Semeando contatos E2E em zapp.contacts (idempotente)..."

set +e
psql "$SUPABASE_DB_URL" --set=ON_ERROR_STOP=on --quiet -f "$SQL_FILE" \
  > >(tee -a "$LOG_FILE") 2> >(tee -a "$LOG_FILE" >&2)
rc=$?
set -e

if [ $rc -ne 0 ]; then
  echo "::error::seed contacts falhou (exit=$rc) — veja $LOG_FILE" >&2
  exit $rc
fi

if grep -q 'E2E_SEED_SUMMARY_JSON:' "$LOG_FILE"; then
  grep 'E2E_SEED_SUMMARY_JSON:' "$LOG_FILE" | tail -n1 | sed 's/^.*E2E_SEED_SUMMARY_JSON://' > "$SUMMARY_JSON"
  echo "→ summary → $SUMMARY_JSON"
  cat "$SUMMARY_JSON"; echo
else
  echo "⚠️  marcador E2E_SEED_SUMMARY_JSON não encontrado no log" >&2
  echo '{"kind":"contacts","warning":"summary-not-emitted"}' > "$SUMMARY_JSON"
fi

echo "✓ Seed de contatos concluído."

