#!/usr/bin/env bash
# Adiciona uma SHA de rollback ao arquivo de proteção GHCR.
# Uso: bash scripts/update-rollback-protection.sh <sha12 | production-sha12 | sha-longo>
#
# Exemplos:
#   bash scripts/update-rollback-protection.sh production-abc123456789
#   bash scripts/update-rollback-protection.sh abc123456789
#   bash scripts/update-rollback-protection.sh abc123456789abcdef... (trunca para 12)
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROTECTED_FILE="$REPO_ROOT/infra/ghcr-protected-tags.txt"

INPUT="${1:-}"
if [ -z "$INPUT" ]; then
  echo "Uso: $0 <sha12 | production-sha12 | sha-longo>"
  echo ""
  echo "Exemplos:"
  echo "  $0 production-abc123456789"
  echo "  $0 abc123456789"
  exit 1
fi

# Extrai apenas os 12 primeiros caracteres do SHA (remove prefixo production- se houver)
SHA12="${INPUT##*production-}"
SHA12="${SHA12:0:12}"

if [ ${#SHA12} -lt 12 ]; then
  echo "Erro: SHA inválido — esperado mínimo 12 caracteres, obtido '${SHA12}' (${#SHA12} chars)"
  exit 1
fi

# Valida que é exatamente hex lowercase [0-9a-f]{12} — evita injeção de caracteres
# especiais (pipe, espaço, colchete) que quebrariam a regex do ignore-versions no CI.
if ! printf '%s' "$SHA12" | grep -qE '^[0-9a-f]{12}$'; then
  echo "Erro: SHA inválido — deve conter exatamente 12 caracteres hexadecimais lowercase [0-9a-f], obtido '${SHA12}'"
  exit 1
fi

if [ ! -f "$PROTECTED_FILE" ]; then
  echo "Erro: arquivo não encontrado: $PROTECTED_FILE"
  exit 1
fi

# grep -qxF: -x = linha inteira (evita falso-positivo se SHA aparecer em comentário)
if grep -qxF "$SHA12" "$PROTECTED_FILE" 2>/dev/null; then
  echo "SHA $SHA12 já está em $PROTECTED_FILE — nenhuma alteração."
  exit 0
fi

printf '%s\n' "$SHA12" >> "$PROTECTED_FILE"
echo "Adicionado: $SHA12 → $PROTECTED_FILE"
echo ""
echo "Próximos passos:"
echo "  git add infra/ghcr-protected-tags.txt"
echo "  git commit -m 'chore: protege rollback production-$SHA12 da limpeza GHCR'"
