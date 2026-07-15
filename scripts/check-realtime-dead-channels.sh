#!/usr/bin/env bash
# check-realtime-dead-channels.sh
# CI Guard: detecta subscriptions Supabase Realtime que apontam para views públicas mortas.
#
# Views NUNCA emitem WAL events. Qualquer .on('postgres_changes', { schema: 'public', table: VIEW_TABLE })
# é um canal silenciosamente morto — nunca dispara callbacks.
#
# Tabelas em zapp são base tables — schema: 'zapp' no client:
#   whatsapp_connections, password_reset_requests, rate_limit_logs, security_alerts, profiles
#
# Views (não emitem Realtime) — redirecionar para tabela-fonte:
#   whisper_messages  → zapp.whisper_messages
#   team_messages     → zapp.team_messages
#   contacts          → evo.evolution_contacts
#   messages          → evo.evolution_messages
#   evolution_messages→ evo.evolution_messages
#
# Uso:
#   bash scripts/check-realtime-dead-channels.sh          # exits 1 if violation found
#   bash scripts/check-realtime-dead-channels.sh --fix    # auto-replace (dry run only, shows diff)

set -euo pipefail

SRC_DIR="${1:-src}"
DEAD_TABLES=("whisper_messages" "team_messages" "contacts" "messages" "evolution_messages")

VIOLATIONS=()

echo "🔍 Checking for dead public-schema realtime subscriptions in ${SRC_DIR}/..."

for TABLE in "${DEAD_TABLES[@]}"; do
  # Grep for schema:'public' + table:'TABLE' on same line, excluding comment lines
  # Uses -P for Perl-compatible regex (handles optional whitespace)
  while IFS= read -r match; do
    # Skip lines that are comments (// or /* at start of trimmed line)
    TRIMMED=$(echo "$match" | sed 's/^[[:space:]]*//')
    if [[ "$TRIMMED" == //* ]] || [[ "$TRIMMED" == '/*'* ]]; then
      continue
    fi
    VIOLATIONS+=("$match")
  done < <(grep -rn --include='*.ts' --include='*.tsx' \
    --exclude='*.test.ts' --exclude='*.test.tsx' \
    --exclude='*.spec.ts' --exclude='*.spec.tsx' \
    -P "schema:\s*['\"]public['\"].*?table:\s*['\"]${TABLE}['\"]" \
    "${SRC_DIR}" 2>/dev/null || true)
done

if [[ ${#VIOLATIONS[@]} -eq 0 ]]; then
  echo "✅ No dead realtime subscriptions found."
  exit 0
fi

echo ""
echo "❌ DEAD REALTIME SUBSCRIPTIONS DETECTED — these views never emit WAL events:"
echo ""
for V in "${VIOLATIONS[@]}"; do
  echo "  ${V}"
done

echo ""
echo "Fix: repoint subscriptions to base schema:"
echo "  zapp.whisper_messages    → schema: 'zapp', table: 'whisper_messages'"
echo "  zapp.team_messages       → schema: 'zapp', table: 'team_messages'"
echo "  zapp.contacts (view)     → schema: 'evo',  table: 'evolution_contacts'"
echo "  zapp.messages (view)     → schema: 'evo',  table: 'evolution_messages'"
echo "  zapp.evolution_messages  → schema: 'evo',  table: 'evolution_messages'"
echo ""
echo "See: docs/realtime-schema-guide.md"
echo ""

exit 1
