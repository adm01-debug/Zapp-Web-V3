#!/bin/sh
# lint-migrations.sh - Detecta migrations com DROP+CREATE POLICY nao-idempotente
# Uso: sh scripts/lint-migrations.sh [supabase/migrations]
# Exit 0: apenas warn (modo CI informativo)
# Ref: ops.safe_create_policy() - alternativa idempotente

TARGET="${1:-supabase/migrations}"
WARN=0

echo "=== Migration Lint: idempotencia de RLS policies ==="
echo "Alvo: $TARGET"
echo ""

for f in $(find "$TARGET" -name "*.sql" | sort -t/ -k3); do
  base=$(basename "$f")
  # Ignorar a migration que define o helper
  case "$base" in *pgrst_notify_ratelimit*) continue ;; esac

  drops=$(grep -c "DROP POLICY" "$f" 2>/dev/null); drops=${drops:-0}
  creates=$(grep -c "CREATE POLICY" "$f" 2>/dev/null); creates=${creates:-0}
  safe=$(grep -c "safe_create_policy" "$f" 2>/dev/null); safe=${safe:-0}

  if [ "$drops" -gt 0 ] 2>/dev/null && [ "$creates" -gt 0 ] 2>/dev/null; then
    echo "WARN $base  DROP=$drops CREATE=$creates safe_uses=$safe"
    WARN=$(( WARN + 1 ))
  fi
done

echo ""
echo "=== $WARN migrations nao-idempotentes ==="
if [ "$WARN" -gt 0 ]; then
  echo "Padrao correto: SELECT ops.safe_create_policy(schema,table,name,def);"
  echo "Documentacao:  supabase/migrations/20260807240000_pgrst_notify_ratelimit.sql"
fi
exit 0
