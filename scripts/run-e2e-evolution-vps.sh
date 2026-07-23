#!/usr/bin/env bash
# Executa a suite Playwright E2E do módulo Evolution contra a VPS.
#
# Uso:
#   E2E_USER_EMAIL=... E2E_USER_PASSWORD=... ./scripts/run-e2e-evolution-vps.sh
#
# Variáveis:
#   E2E_BASE_URL              (default: https://zapp.atomicabr.com.br)
#   E2E_USER_EMAIL, E2E_USER_PASSWORD (obrigatórias)
#   E2E_WEBHOOK_PARITY=1      inclui webhook-providers-parity.spec.ts
#   E2E_INCLUDE_VOICE=1       inclui voice-changer-integration.spec.ts
#   VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY (opcionais)

set -euo pipefail

# shellcheck source=lib/preflight-secrets.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/preflight-secrets.sh"
preflight_secrets "run-e2e-evolution" E2E_USER_EMAIL E2E_USER_PASSWORD

export E2E_BASE_URL="${E2E_BASE_URL:-https://zapp.atomicabr.com.br}"
export CI="${CI:-true}"

echo "Alvo: $E2E_BASE_URL"
echo "Usuário: $E2E_USER_EMAIL"

SPECS=(
  e2e/admin-evolution-api-smoke.spec.ts
  e2e/evolution-retry-failure.spec.ts
  e2e/evolution-media-retry-failure.spec.ts
  e2e/whatsapp-connection.spec.ts
  e2e/whatsapp-reactions-realtime.spec.ts
  e2e/whatsapp-reactions-advanced.spec.ts
)

if [ "${E2E_WEBHOOK_PARITY:-0}" = "1" ]; then
  SPECS+=(e2e/webhook-providers-parity.spec.ts)
fi

if [ "${E2E_INCLUDE_VOICE:-0}" = "1" ]; then
  SPECS+=(e2e/voice-changer-integration.spec.ts)
fi

npx playwright install --with-deps chromium

npx playwright test \
  --config=playwright.e2e.config.ts \
  --reporter=list,html,json \
  "${SPECS[@]}" 2>&1 | tee playwright-evolution.log

echo ""
echo "Relatório HTML: playwright-report-e2e/index.html"
echo "Traces/screenshots: test-results/"
