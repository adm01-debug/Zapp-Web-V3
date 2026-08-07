#!/usr/bin/env bash
# status.sh — Resumo geral: preview, git, build
cd /c/zapp-web-v3
echo "=== STATUS DO PROJETO ==="
bash scripts/preview/health-check.sh
echo "--- GIT ---"
echo "Branch: $(git branch --show-current)"
echo "Mudanças pendentes: $(git status --porcelain | wc -l)"
echo "--- BUILD ---"
[ -f dist/index.html ] && echo "dist/ existe ($(du -sh dist 2>/dev/null | cut -f1))" || echo "dist/ não existe"
echo "--- LOGS ---"
ls -la scripts/preview/logs/ 2>/dev/null | tail -5
