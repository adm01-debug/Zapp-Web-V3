#!/bin/bash
# Bateria 1: varredura de autenticacao das Edge Functions (sem token)
BASE="https://supabase.atomicabr.com.br/functions/v1"
FNS=$(ls -1 /tmp/fns.txt 2>/dev/null && cat /tmp/fns.txt || echo "")
# Lista das 23 publicas (allowlist do main/index.ts em producao)
PUB="evolution-webhook whatsapp-webhook whatsapp-cloud-webhook whatsapp-cloud-webhook-verify elevenlabs-webhook gmail-webhook email-track-pixel email-track-link login-attempts sentiment-alert evolution-health evolution-sender bitrix-api send-rate-limit-alert cleanup-rate-limit-logs evolution-sync classify-audio-meme classify-emoji classify-sticker health-check status sicoob-bridge public-api metrics health"

echo "fn|http|corpo_tipo"
for fn in $FNS; do
  [ "$fn" = "main" ] && continue
  case "$fn" in _*|gmail-tests.test.ts) continue;; esac
  RESP=$(curl -s -m 8 -w "|%{http_code}" -X POST "$BASE/$fn" -d '{}' 2>/dev/null)
  CODE="${RESP##*|}"
  BODY="${RESP%|*}"
  # Classifica
  if [ "$CODE" = "401" ]; then
    if echo "$BODY" | grep -qi "authorization failed"; then TIPO="401_MAIN"
    elif echo "$BODY" | grep -qi "missing authorization"; then TIPO="401_MAIN"
    else TIPO="401_FN"
    fi
  elif [ "$CODE" = "200" ]; then TIPO="200"
  else TIPO="$CODE"
  fi
  echo "$fn|$CODE|$TIPO"
done
