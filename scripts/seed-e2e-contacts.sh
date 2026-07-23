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

[ -f "$SQL_FILE" ] || { echo "::error::SQL não encontrado: $SQL_FILE" >&2; exit 2; }

echo "→ Semeando contatos E2E em zapp.contacts (idempotente)..."
psql "$SUPABASE_DB_URL" --set=ON_ERROR_STOP=on --quiet -f "$SQL_FILE"
echo "✓ Seed de contatos concluído."
