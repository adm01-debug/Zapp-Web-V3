#!/usr/bin/env bash
# Executa a suite Playwright E2E do módulo Inbox contra a VPS.
#
# Uso:
#   E2E_USER_EMAIL=... E2E_USER_PASSWORD=... ./scripts/run-e2e-inbox-vps.sh
#
# Variáveis:
#   E2E_BASE_URL              (default: https://zapp.atomicabr.com.br)
#   E2E_USER_EMAIL, E2E_USER_PASSWORD (obrigatórias)
#   E2E_INCLUDE_REACTIONS=1   inclui whatsapp-reactions-realtime.spec.ts
#   VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY (opcionais)

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
  e2e/inbox-full-flow.spec.ts
  e2e/inbox-realtime.spec.ts
  e2e/inbox-thread-message-arrival.spec.ts
  e2e/inbox-scope.spec.ts
  e2e/inbox-created-thread-inbound.spec.ts
  e2e/chat-accessibility.spec.ts
  e2e/chat-advanced.spec.ts
  e2e/chat-media.spec.ts
  e2e/chat-resilience-responsive.spec.ts
  e2e/send-message.spec.ts
  e2e/send-message-cycle.spec.ts
  e2e/conversations-routing.spec.ts
  e2e/connection-to-inbox-inbound.spec.ts
)

if [ "${E2E_INCLUDE_REACTIONS:-0}" = "1" ]; then
  SPECS+=(e2e/whatsapp-reactions-realtime.spec.ts)
fi

npx playwright install --with-deps chromium

npx playwright test \
  --config=playwright.e2e.config.ts \
  --reporter=list,html,json \
  "${SPECS[@]}" 2>&1 | tee playwright-inbox.log

echo ""
echo "Relatório HTML: playwright-report-e2e/index.html"
echo "Traces/screenshots: test-results/"
