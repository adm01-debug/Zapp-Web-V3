#!/bin/sh
# lint-migrations.sh — detecta DROP+CREATE POLICY não-idempotente
#
# REGRA HISTÓRICA: migrations ANTERIORES a 20260807240000 → EXEMPT
#   (safe_create_policy não existia ainda; converter quebraria replay ordenado)
# ENFORCER: migrations de 20260807240000 em diante DEVEM usar safe_create_policy()
#   ou incluir comentário "-- lint:ok" para supressão explícita.
# CANONICAL SQUASH: arquivos *squash* ou *canonical_schema* → sempre EXEMPT.
#
# USO:   sh scripts/lint-migrations.sh [dir]
# CI:    Troque "exit 0" final por "exit $WARN" para enforcer estrito.

MIGRATIONS_DIR="${1:-supabase/migrations}"
WARN=0
CHECKED=0
EXEMPT=0
SAFE_POLICY_EPOCH="20260807240000"

for f in "$MIGRATIONS_DIR"/*.sql; do
  [ -f "$f" ] || continue
  FILENAME="$(basename "$f")"
  TIMESTAMP="${FILENAME%%_*}"

  # Squash canônico → sempre isento
  case "$FILENAME" in *squash*|*canonical_schema*)
    EXEMPT=$((EXEMPT+1)); continue ;;
  esac

  # Supressão explícita via comentário
  grep -q 'lint:ok' "$f" 2>/dev/null && { EXEMPT=$((EXEMPT+1)); continue; }

  # Migrations pré-epoch → isentas (função não existia)
  case "$TIMESTAMP" in [0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9])
    if [ "$TIMESTAMP" -lt "$SAFE_POLICY_EPOCH" ] 2>/dev/null; then
      EXEMPT=$((EXEMPT+1)); continue
    fi ;;
  esac

  # Contar padrões (grep -c nunca retorna string vazia, só "0" ou N)
  DROP_COUNT=$(grep -c -iE '^[[:space:]]*DROP POLICY' "$f" 2>/dev/null); DROP_COUNT=${DROP_COUNT:-0}
  CREATE_COUNT=$(grep -c -iE '^[[:space:]]*CREATE POLICY' "$f" 2>/dev/null); CREATE_COUNT=${CREATE_COUNT:-0}
  SAFE_COUNT=$(grep -c -iE 'safe_create_policy' "$f" 2>/dev/null); SAFE_COUNT=${SAFE_COUNT:-0}

  if [ "$DROP_COUNT" -gt 0 ] || [ "$CREATE_COUNT" -gt 0 ]; then
    CHECKED=$((CHECKED+1))
    if [ "$SAFE_COUNT" -eq 0 ]; then
      echo "WARN $FILENAME  DROP=$DROP_COUNT CREATE=$CREATE_COUNT safe_uses=0"
      WARN=$((WARN+1))
    else
      echo "OK $FILENAME  DROP=$DROP_COUNT CREATE=$CREATE_COUNT safe_uses=$SAFE_COUNT"
    fi
  fi
done

echo ""
echo "=== RESULTADO: Verificados=$CHECKED Warnings=$WARN Isentos=$EXEMPT ==="
if [ "$WARN" -gt 0 ]; then
  echo ""
  echo "ACAO: $WARN migration(s) pós-$SAFE_POLICY_EPOCH usam DROP+CREATE sem safe_create_policy()"
  echo "Padrão correto:"
  echo "  SELECT ops.safe_create_policy('schema','tabela','nome_policy','FOR SELECT TO authenticated USING (true)');"
fi

exit 0   # troque por: exit \$WARN   para enforcer estrito em CI
