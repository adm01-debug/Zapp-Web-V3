#!/usr/bin/env bash
# Executa a suite Playwright E2E do módulo Admin contra a VPS.
#
# Uso:
#   E2E_USER_EMAIL=... E2E_USER_PASSWORD=... ./scripts/run-e2e-admin-vps.sh
#
# Variáveis:
#   E2E_BASE_URL  (default: https://zapp.atomicabr.com.br)
#   E2E_USER_EMAIL, E2E_USER_PASSWORD (obrigatórias)
#   VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY (opcionais, p/ cleanup)

set -euo pipefail

export E2E_BASE_URL="${E2E_BASE_URL:-https://zapp.atomicabr.com.br}"
export CI="${CI:-true}"

if [ -z "${E2E_USER_EMAIL:-}" ] || [ -z "${E2E_USER_PASSWORD:-}" ]; then
  echo "ERRO: defina E2E_USER_EMAIL e E2E_USER_PASSWORD antes de rodar." >&2
  exit 1
fi

echo "Alvo: $E2E_BASE_URL"
echo "Usuário: $E2E_USER_EMAIL"

SPECS=(
  e2e/admin-automations.spec.ts
  e2e/admin-channels.spec.ts
  e2e/admin-evolution-api-smoke.spec.ts
  e2e/admin-failed-messages-filters.spec.ts
  e2e/admin-failed-messages-filters-intersection.spec.ts
  e2e/admin-queues.spec.ts
  e2e/admin-webhook-filters.spec.ts
  e2e/admin-webhook-filters-intersection.spec.ts
)

npx playwright install --with-deps chromium

npx playwright test \
  --config=playwright.e2e.config.ts \
  --reporter=list,html,json \
  "${SPECS[@]}" 2>&1 | tee playwright-admin.log

echo ""
echo "Relatório HTML: playwright-report-e2e/index.html"
echo "Traces/screenshots: test-results/"
