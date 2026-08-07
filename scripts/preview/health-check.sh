#!/usr/bin/env bash
# health-check.sh — Verifica se o preview está saudável e reporta em linguagem simples
cd /c/zapp-web-v3
CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/ 2>/dev/null || echo "000")
if [ "$CODE" = "200" ]; then
  echo "✅ Preview OK — http://localhost:8080 (HTTP 200 = tudo funcionando)"
  TITLE=$(curl -s http://localhost:8080/ | grep -o '<title>[^<]*</title>' | head -1 | sed 's/<[^>]*>//g')
  [ -n "$TITLE" ] && echo "📄 Página: $TITLE"
else
  echo "❌ Preview FORA DO AR (HTTP $CODE)"
  echo "   Ação: rode 'bash scripts/preview/start-preview.sh'"
fi
