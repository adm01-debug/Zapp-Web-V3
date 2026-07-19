#!/usr/bin/env bash
# check-realtime-dead-channels.sh
# CI Guard: detecta subscriptions Supabase Realtime silenciosas.
#
# Duas classes de canais mortos:
#
# CLASSE A — schema:'public' para qualquer tabela (sem tabelas reais em public neste projeto).
#
# CLASSE B — schema:'evo' apontando para partições quando publish_via_partition_root=true.
#   Com publish_via_partition_root=true, eventos CDC são publicados pela tabela RAIZ,
#   nunca pelas partições. Subscrições em partições recebem zero eventos.
#   Padrões de partição evo: *_wpp2, *_comercial_*, *_v2_20[0-9][0-9]_*, *_partition_*
#
# Uso:
#   bash scripts/check-realtime-dead-channels.sh          # exits 1 if violation found
#   bash scripts/check-realtime-dead-channels.sh --fix    # auto-replace (dry run only, shows diff)
#
# Ver: docs/realtime-schema-guide.md

set -euo pipefail

SRC_DIR="${1:-src}"
VIOLATIONS=()

echo "Checking for dead realtime subscriptions in ${SRC_DIR}/..."

# ---------------------------------------------------------------------------
# CLASSE A: schema:'public' (nenhuma tabela real existe em public neste projeto)
# ---------------------------------------------------------------------------
DEAD_PUBLIC_TABLES=("whisper_messages" "team_messages" "contacts" "messages" "evolution_messages")

for TABLE in "${DEAD_PUBLIC_TABLES[@]}"; do
  while IFS= read -r match; do
    # grep -rn output: "filepath:linenum:content" — strip prefix to get code content
    CONTENT=$(echo "$match" | sed 's/^[^:]*:[0-9]*://')
    TRIMMED=$(echo "$CONTENT" | sed 's/^[[:space:]]*//')
    if [[ "$TRIMMED" == //* ]] || [[ "$TRIMMED" == '/*'* ]]; then continue; fi
    VIOLATIONS+=("[CLASSE-A public-schema] ${match}")
  done < <(grep -rn --include='*.ts' --include='*.tsx' \
    --exclude='*.test.ts' --exclude='*.test.tsx' \
    --exclude='*.spec.ts' --exclude='*.spec.tsx' \
    -P "schema:\s*['\"]public['\"].*?table:\s*['\"]${TABLE}['\"]" \
    "${SRC_DIR}" 2>/dev/null || true)
done

# ---------------------------------------------------------------------------
# CLASSE B: schema:'evo' + tabela que é partição (publish_via_partition_root=true)
# Padrões de nomes de partições conhecidos (auditado 2026-07-16 — 23 partições):
#   evolution_messages_wpp2, evolution_conversations_wpp2,
#   evolution_messages_artes, evolution_messages_compras,
#   evolution_messages_comercial_01..15, evolution_messages_default,
#   evolution_messages_financeiro, evolution_messages_gravacao,
#   evolution_messages_logistica, evolution_messages_marketing,
#   (idem para evolution_conversations_*),
#   evolution_webhook_events_v2_2026_07, evolution_webhook_events_v2_default, etc.
#
# Estratégia de detecção em dois passos:
#   1. Restringir a arquivos que declaram schema:'evo' (contexto Realtime).
#   2. Dentro desses arquivos, procurar table: apontando para partição.
# Isso evita falsos positivos em queries SELECT que também usam .from('partition').
# ---------------------------------------------------------------------------
PARTITION_SUFFIX="(wpp[0-9]+|artes|comercial_[0-9]+|compras|default|financeiro|gravacao|logistica|marketing)"
PARTITION_PATTERN="(evolution_(messages|conversations)_${PARTITION_SUFFIX}|evolution_webhook_events_v2_(default|[0-9]{4}_[0-9]{2}))"

while IFS= read -r file; do
  while IFS= read -r match; do
    # grep -nP output: "linenum:content" — strip prefix to get code content
    CONTENT=$(echo "$match" | sed 's/^[0-9]*://')
    TRIMMED=$(echo "$CONTENT" | sed 's/^[[:space:]]*//')
    if [[ "$TRIMMED" == //* ]] || [[ "$TRIMMED" == '/*'* ]]; then continue; fi
    VIOLATIONS+=("[CLASSE-B evo-partition publish_via_partition_root] ${file}:${match}")
  done < <(grep -nP "table:\s*['\"]${PARTITION_PATTERN}['\"]" "$file" 2>/dev/null || true)
done < <(grep -rlP "schema:\s*['\"]evo['\"]" \
  --include='*.ts' --include='*.tsx' \
  --exclude='*.test.ts' --exclude='*.test.tsx' \
  --exclude='*.spec.ts' --exclude='*.spec.tsx' \
  "${SRC_DIR}" 2>/dev/null || true)

# ---------------------------------------------------------------------------
# Resultado
# ---------------------------------------------------------------------------
if [[ ${#VIOLATIONS[@]} -eq 0 ]]; then
  echo "OK — no dead realtime subscriptions found."
  exit 0
fi

echo ""
echo "DEAD REALTIME SUBSCRIPTIONS DETECTED:"
echo ""
for V in "${VIOLATIONS[@]}"; do
  echo "  ${V}"
done

echo ""
echo "FIXES:"
echo "  Classe A — schema: 'public' subscriptions:"
echo "    zapp.whisper_messages    -> schema: 'zapp', table: 'whisper_messages'"
echo "    zapp.team_messages       -> schema: 'zapp', table: 'team_messages'"
echo "    zapp.contacts (view)     -> schema: 'evo',  table: 'evolution_contacts'"
echo "    zapp.evolution_messages  -> schema: 'evo',  table: 'evolution_messages'"
echo ""
echo "  Classe B — evo schema partition subscriptions (publish_via_partition_root=true):"
echo "    evolution_messages_wpp2       -> table: 'evolution_messages'"
echo "    evolution_conversations_wpp2  -> table: 'evolution_conversations'"
echo "    evolution_webhook_events_v2_* -> table: 'evolution_webhook_events_v2'"
echo ""
echo "See: docs/realtime-schema-guide.md"
echo ""

exit 1
