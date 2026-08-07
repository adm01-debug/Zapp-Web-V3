#!/usr/bin/env bash
# watchdog-preview.sh — Vigia o dev server; reinicia se cair. Roda via cron 1x/min.
cd /c/zapp-web-v3
CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/ 2>/dev/null || echo "000")
if [ "$CODE" != "200" ]; then
  echo "$(date '+%H:%M:%S') — Preview caiu (HTTP $CODE). Reiniciando..." >> scripts/preview/logs/watchdog.log
  bash scripts/preview/start-preview.sh >> scripts/preview/logs/watchdog.log 2>&1
fi
# Silêncio se estiver tudo ok (padrão watchdog)
