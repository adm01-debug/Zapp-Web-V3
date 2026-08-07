#!/usr/bin/env bash
# stop-preview.sh — Desliga o dev server do ZAPP Web
cd /c/zapp-web-v3
PID=$(netstat -ano 2>/dev/null | grep ':8080.*LISTENING' | head -1 | awk '{print $NF}')
if [ -n "$PID" ]; then
  powershell -Command "Stop-Process -Id $PID -Force" 2>/dev/null
  echo "🛑 Dev server parado (PID $PID)"
else
  echo "ℹ️ Nenhum dev server na 8080"
fi
