#!/usr/bin/env bash
# diff-report.sh — Resumo legível das mudanças (para o chat)
cd /c/zapp-web-v3
echo "=== MUDANÇAS PENDENTES ($(git status --porcelain | wc -l) arquivos) ==="
git status --porcelain | head -30
echo ""
echo "=== RESUMO DO DIFF ==="
git diff --stat | tail -20
