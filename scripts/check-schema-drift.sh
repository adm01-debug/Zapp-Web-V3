#!/usr/bin/env bash
# Guard de drift de schema (legado migrado -> canônico). Falha o build se houver divergência.
# Requer DATABASE_URL apontando para o banco canônico (mesmo usado no supabase db push).
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
: "${DATABASE_URL:?defina DATABASE_URL}"
echo "▶ Rodando check_schema_drift.sql..."
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$DIR/check_schema_drift.sql"
echo "✔ Sem drift."
