#!/usr/bin/env bash
# check-edge-function-sync.sh
# Garante sincronismo Frontend <-> Backend na camada de Edge Functions.
# Falha (exit 1) se o frontend chamar supabase.functions.invoke('X') para um X
# que NÃO existe em supabase/functions/. Use no CI (pre-build / lint stage).
#
# Limitação conhecida: só detecta nomes de função LITERAIS (string fixa no invoke).
# Nomes com SUFIXO dinâmico (ex.: `evolution-api/${action}`) funcionam — o regex
# para no primeiro caractere fora de [a-zA-Z0-9_-] e captura o prefixo estático.
# Nomes com PREFIXO dinâmico (ex.: `${provider}-oauth`) NÃO são cobertos: o regex
# não captura nada nesse caso e a chamada passa sem ser checada (falso-negativo
# silencioso). Hoje não há esse padrão no código (auditado em 2026-06-30).
set -euo pipefail
cd "$(dirname "$0")/.."

EXIST="$(mktemp)"; CALLED="$(mktemp)"
trap 'rm -f "$EXIST" "$CALLED"' EXIT

# Nota: "|| true" nas duas pipelines abaixo é proposital. Sob pipefail, um grep
# que não encontra NENHUM match retorna exit 1, o que sem o "|| true" mataria o
# script aqui mesmo (silenciosamente, sem nenhuma mensagem) em vez de tratar
# corretamente o caso vazio. "Zero chamadas" ou "zero functions" deve avaliar
# como vazio (e portanto trivialmente sem órfãs), não travar a build sem explicação.
ls supabase/functions/ | grep -v '^_' | sort > "$EXIST" || true

grep -rhoE "functions\.invoke\(\s*['\"\`][a-zA-Z0-9_-]+" src \
  --include='*.ts' --include='*.tsx' \
  | sed -E "s/.*invoke\(\s*['\"\`]//" \
  | sort -u > "$CALLED" || true

ORPHANS="$(comm -23 "$CALLED" "$EXIST" || true)"

if [[ -n "$ORPHANS" ]]; then
  echo "❌ FE/BE DESSINCRONIZADO — funções chamadas no frontend que NÃO existem no backend:" >&2
  echo "$ORPHANS" | sed 's/^/   - /' >&2
  echo "" >&2
  echo "   Crie a Edge Function em supabase/functions/<nome>/ ou corrija o nome no invoke()." >&2
  exit 1
fi

echo "✅ FE/BE em sincronismo: todas as $(wc -l < "$CALLED" | tr -d ' ') funções chamadas existem no backend."
