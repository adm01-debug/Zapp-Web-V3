#!/usr/bin/env bash
# preview-static.sh — Fallback: build + serve estático na 4173 (sem HMR, confiável)
cd /c/zapp-web-v3
echo "🔨 Buildando..."
bun run build > scripts/preview/logs/build.log 2>&1 && echo "✅ Build ok" || { echo "❌ Build falhou"; tail -20 scripts/preview/logs/build.log; exit 1; }
echo "🚀 Servindo dist/ na porta 4173..."
nohup bun run preview --host 127.0.0.1 --port 4173 > scripts/preview/logs/preview-static.log 2>&1 &
sleep 3
CODE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:4173/ 2>/dev/null || echo "000")
echo "✅ HTTP $CODE — preview estático em http://localhost:4173"
