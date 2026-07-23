#!/usr/bin/env bash
# Valida que E2E_USER_EMAIL existe e tem permissão de CRM na VPS.
# Falha com exit != 0 e mensagem clara se qualquer critério não for atendido.
#
# Env obrigatórios:
#   SUPABASE_DB_URL   - conexão postgres (superuser ou owner de zapp/auth)
#   E2E_USER_EMAIL    - email do usuário de teste
#
# Uso:
#   SUPABASE_DB_URL=... E2E_USER_EMAIL=... ./scripts/validate-e2e-user.sh

set -euo pipefail

# shellcheck source=lib/preflight-secrets.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/preflight-secrets.sh"
preflight_secrets "validate-e2e-user" SUPABASE_DB_URL E2E_USER_EMAIL

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SQL_FILE="${SCRIPT_DIR}/validate-e2e-user.sql"

if [ ! -f "$SQL_FILE" ]; then
  echo "::error::Arquivo SQL não encontrado: $SQL_FILE" >&2
  exit 2
fi

echo "→ Validando permissões de CRM para $E2E_USER_EMAIL..."

# psql com ON_ERROR_STOP=on -> qualquer RAISE EXCEPTION derruba o script.
if ! psql "$SUPABASE_DB_URL" \
      --set=ON_ERROR_STOP=on \
      --quiet \
      -v email="'${E2E_USER_EMAIL//\'/\'\'}'" \
      -f "$SQL_FILE"; then
  echo ""
  echo "::error::Validação E2E falhou. O usuário $E2E_USER_EMAIL NÃO tem acesso de CRM."
  echo "::error::Rode o workflow 'Seed E2E user (VPS)' e confira zapp.profiles / zapp.user_roles."
  exit 1
fi

echo "✓ E2E_USER_EMAIL validado com permissão de CRM."
