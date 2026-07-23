#!/usr/bin/env bash
# Limpa dados sintéticos gerados pelas suítes E2E de CRM na VPS.
# Usa psql direto (bypass PostgREST) — bom para CI pré/pós execução.
#
# Uso:
#   SUPABASE_DB_URL=postgres://... ./scripts/cleanup-e2e-data.sh

set -euo pipefail

# shellcheck source=lib/preflight-secrets.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/preflight-secrets.sh"
preflight_secrets "cleanup-e2e-data" SUPABASE_DB_URL

echo "[cleanup-e2e] executando zapp.rpc_e2e_cleanup()..."

psql "$SUPABASE_DB_URL" --set=ON_ERROR_STOP=on -X -A -t <<'SQL'
SELECT jsonb_pretty(zapp.rpc_e2e_cleanup());
SQL

echo "[cleanup-e2e] OK"
