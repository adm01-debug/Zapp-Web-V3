#!/usr/bin/env bash
# check-edge-function-sync.sh
# Garante sincronismo Frontend <-> Backend na camada de Edge Functions.
# Falha (exit 1) se o frontend chamar supabase.functions.invoke('X') para um X
# que NÃO existe em supabase/functions/. Use no CI (pre-build / lint stage).
#
# Limitação conhecida: só detecta nomes de função LITERAIS (string fixa no invoke).
# Nomes construídos dinamicamente (ex.: `${provider}-oauth`) não são cobertos.
set -euo pipefail
cd "$(dirname "$0")/.."

EXIST="$(mktemp)"; CALLED="$(mktemp)"
trap 'rm -f "$EXIST" "$CALLED"' EXIT

ls supabase/functions/ | grep -v '^_' | sort > "$EXIST"

grep -rhoE "functions\.invoke\(\s*['\"\`][a-zA-Z0-9_-]+" src \
  --include='*.ts' --include='*.tsx' \
  | sed -E "s/.*invoke\(\s*['\"\`]//" \
  | sort -u > "$CALLED"

ORPHANS="$(comm -23 "$CALLED" "$EXIST" || true)"

if [[ -n "$ORPHANS" ]]; then
  echo "❌ FE/BE DESSINCRONIZADO — funções chamadas no frontend que NÃO existem no backend:" >&2
  echo "$ORPHANS" | sed 's/^/   - /' >&2
  echo "" >&2
  echo "   Crie a Edge Function em supabase/functions/<nome>/ ou corrija o nome no invoke()." >&2
  exit 1
fi

echo "✅ FE/BE em sincronismo: todas as $(wc -l < "$CALLED" | tr -d ' ') funções chamadas existem no backend."
