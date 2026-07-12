#!/usr/bin/env bash
#
# git-untrack-artifacts.sh — Remove arquivos temporários do tracking do git
#
# CONTEXTO:
# Esses arquivos foram adicionados ao .gitignore mas ainda são rastreados
# pelo git porque já estavam no histórico. O .gitignore previne FUTUROS
# commits, mas não remove o tracking existente.
#
# COMO USAR:
# Execute este script na VPS onde o repositório está clonado:
#
#   cd /workspace/repos/zapp-web-v3
#   bash scripts/git-untrack-artifacts.sh
#   git push origin main
#
# O resultado será um commit que remove esses arquivos do tracking
# sem afetar o histórico anterior.
#
# AVISO: Isso não apaga os arquivos do filesystem, apenas para de
# rastrear as mudanças neles.

set -e

echo "==> Removendo arquivos temporários do tracking do git..."

# Lockfile npm (usamos bun.lock como canonical)
git rm --cached package-lock.json 2>/dev/null && echo "  OK: package-lock.json" || echo "  SKIP: package-lock.json (não rastreado)"

# Outputs de scripts de auditoria ad-hoc
git rm --cached audit.js 2>/dev/null && echo "  OK: audit.js" || echo "  SKIP: audit.js"
git rm --cached audit.mjs 2>/dev/null && echo "  OK: audit.mjs" || echo "  SKIP: audit.mjs"
git rm --cached audit.json 2>/dev/null && echo "  OK: audit.json" || echo "  SKIP: audit.json"
git rm --cached full_audit_report.txt 2>/dev/null && echo "  OK: full_audit_report.txt" || echo "  SKIP: full_audit_report.txt"

# Rastreamento de deps desatualizadas
git rm --cached outdated.txt 2>/dev/null && echo "  OK: outdated.txt" || echo "  SKIP: outdated.txt"

# Scripts de dados mock
git rm --cached generate_mock_data.py 2>/dev/null && echo "  OK: generate_mock_data.py" || echo "  SKIP: generate_mock_data.py"
git rm --cached mock_data.sql 2>/dev/null && echo "  OK: mock_data.sql" || echo "  SKIP: mock_data.sql"

# Diretório de trabalho temporário
git rm -r --cached tmp/ 2>/dev/null && echo "  OK: tmp/" || echo "  SKIP: tmp/ (não rastreado ou vazio)"

# Playwright reports (saídas de teste, não são código)
git rm -r --cached playwright-report-a11y/ 2>/dev/null && echo "  OK: playwright-report-a11y/" || echo "  SKIP: playwright-report-a11y/"

echo ""
echo "==> Arquivos removidos do staging. Para confirmar:"
echo "    git commit -m 'chore: untrack legacy artifacts (now in .gitignore)'"
echo "    git push origin main"
