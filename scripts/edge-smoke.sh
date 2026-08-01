#!/usr/bin/env bash
#
# edge-smoke.sh — Smoke test determinístico do gate de autenticação das
# Edge Functions do Supabase self-hosted.
#
# Base: https://supabase.atomicabr.com.br/functions/v1
#
# Testes:
#   T1 — Funções FORA da allowlist: POST sem token      -> deve retornar 401
#   T2 — Funções NA allowlist:      POST sem token      -> deve retornar != 401
#   T3 — Webhooks sem HMAC:         POST sem assinatura -> deve retornar != 200
#   T4 — health-check:              GET                  -> deve retornar 200
#
# Saída:
#   PASS T<n> <fn>=<code>  (teste ok)
#   FAIL T<n> <fn>=<code>  (teste falhou — formato consumido por CI)
#   Ao final: "SMOKE OK" (exit 0) ou "SMOKE FAILED" (exit 1).
#
# Requisitos: curl. Não usa jq.
#
# Uso: scripts/edge-smoke.sh [BASE_URL]

set -u

BASE_URL="${1:-https://supabase.atomicabr.com.br/functions/v1}"

FAILED=0

# http_code <method> <fn> -> imprime o código HTTP (000 = erro de rede/timeout)
http_code() {
  curl -sk -o /dev/null -w '%{http_code}' --max-time 15 -X "$1" "$BASE_URL/$2"
}

# expect_eq <T<n>> <fn> <esperado> — PASS se code == esperado
expect_eq() {
  local tid="$1" fn="$2" expected="$3"
  local code
  code="$(http_code POST "$fn")"
  if [ "$code" = "$expected" ]; then
    printf 'PASS %s %s=%s\n' "$tid" "$fn" "$code"
  else
    printf 'FAIL %s %s=%s\n' "$tid" "$fn" "$code"
    FAILED=1
  fi
}

# expect_ne <T<n>> <fn> <proibido> — PASS se code != proibido e != 000 (rede)
expect_ne() {
  local tid="$1" fn="$2" forbidden="$3"
  local code
  code="$(http_code POST "$fn")"
  if [ "$code" != "$forbidden" ] && [ "$code" != "000" ]; then
    printf 'PASS %s %s=%s\n' "$tid" "$fn" "$code"
  else
    printf 'FAIL %s %s=%s\n' "$tid" "$fn" "$code"
    FAILED=1
  fi
}

# T1 — fora da allowlist: POST sem token deve retornar 401
# (analyze-external-db NÃO entra aqui: está bloqueada no Kong → 404, ver T5)
for fn in \
  create-user \
  approve-password-reset \
  evolution-api \
  ai-router \
  connection-health-check
do
  expect_eq T1 "$fn" 401
done

# T2 — allowlist: POST sem token deve retornar != 401
for fn in \
  health-check \
  status \
  email-track-pixel \
  email-track-link \
  login-attempts \
  cleanup-rate-limit-logs
do
  expect_ne T2 "$fn" 401
done

# T3 — webhooks sem HMAC: POST sem assinatura deve retornar != 200
for fn in \
  evolution-webhook \
  whatsapp-cloud-webhook \
  gmail-webhook \
  elevenlabs-webhook
do
  expect_ne T3 "$fn" 200
done

# T4 — health-check GET deve ser 200
T4_CODE="$(curl -sk -o /dev/null -w '%{http_code}' --max-time 15 "$BASE_URL/health-check")"
if [ "$T4_CODE" = "200" ]; then
  printf 'PASS T4 health-check=%s\n' "$T4_CODE"
else
  printf 'FAIL T4 health-check=%s\n' "$T4_CODE"
  FAILED=1
fi

# T5 — bloqueio no Kong: funções request-terminated devem retornar 404
for fn in \
  external-db-proxy \
  external-db-bridge \
  analyze-external-db
do
  expect_eq T5 "$fn" 404
done

if [ "$FAILED" -eq 1 ]; then
  printf 'SMOKE FAILED\n' >&2
  exit 1
fi

printf 'SMOKE OK\n'
exit 0
