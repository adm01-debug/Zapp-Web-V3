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

echo "[seed-e2e] usuário: $E2E_USER_EMAIL"

psql "$SUPABASE_DB_URL" \
  --set=ON_ERROR_STOP=on \
  --set=email="'${E2E_USER_EMAIL//\'/\'\'}'" \
  --set=password="'${E2E_USER_PASSWORD//\'/\'\'}'" \
  -f "$SCRIPT_DIR/seed-e2e-user.sql"

echo "[seed-e2e] OK — usuário pronto para E2E de CRM."
