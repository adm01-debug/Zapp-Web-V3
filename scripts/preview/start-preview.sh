#!/usr/bin/env bash
# start-preview.sh — Sobe o dev server do ZAPP Web (HMR em tempo real) na porta 8080
set -e
cd /c/zapp-web-v3

# Evita duplicatas
if netstat -ano 2>/dev/null | grep -q ':8080.*LISTENING'; then
  echo "✅ Dev server JÁ está rodando na porta 8080"
  exit 0
fi

echo "🚀 Subindo dev server na porta 8080 (atualização em tempo real)..."
nohup bun run dev --port 8080 --strictPort > scripts/preview/logs/dev.log 2>&1 &
echo "PID: $!"
sleep 4

# Verifica
CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/ || echo "000")
if [ "$CODE" = "200" ]; then
  echo "✅ HTTP 200 — site no ar em http://localhost:8080"
else
  echo "⚠️ HTTP $CODE — veja scripts/preview/logs/dev.log"
  tail -5 scripts/preview/logs/dev.log
fi
