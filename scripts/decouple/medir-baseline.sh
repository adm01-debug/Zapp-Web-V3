#!/usr/bin/env bash
set -uo pipefail
#
# W10_medir_baseline.sh - Baseline do ensaio de troca de provider (ZAPP).
#
# Uso: W10_medir_baseline.sh [rotulo] [host] [porta]
#   rotulo: identificador da medicao (default: baseline) - ex.: antes|durante|depois
#   host:   IP da VPS (default: 209.142.67.51; env VPS_HOST sobrescreve)
#   porta:  porta SSH (default: 6543; env VPS_PORT sobrescreve)
#
# Imprime em formato tabular: rotulo + timestamp + 4 metricas:
#   msgs_24h, dlq, health_score+grade, grants_escrita_evo
#
# Execucao na VPS:
#   ssh -i ~/.ssh/vps_zapp_e2e -p <porta> root@<host> \
#     docker exec supabase_db psql -U postgres -d postgres -t -A -c '<query>'
#
# Modo local (tunel/MCP): exporte W10_PSQL com o psql base (ex.:
#   W10_PSQL='psql -U postgres -d postgres -h 127.0.0.1 -p 5432') e o ssh e pulado.
#
# Guard local: sem redirecionamento para null device - erros vao com 2>&1 | tail -n 1.

set -u

ROTULO="${1:-baseline}"
HOST="${2:-${VPS_HOST:-209.142.67.51}}"
PORTA="${3:-${VPS_PORT:-6543}}"
CHAVE="${VPS_KEY:-$HOME/.ssh/vps_zapp_e2e}"
TS="$(date '+%Y-%m-%d %H:%M:%S')"

Q_MSGS="SELECT count(*) FROM zapp.evolution_messages WHERE created_at > now() - interval '24 hours'"
Q_DLQ="SELECT count(*) FROM zapp.evolution_webhook_dlq"
Q_HEALTH="SELECT (fn.score->>'score')::numeric, fn.score->>'grade' FROM (SELECT zapp.fn_system_health_score() AS score) fn"
Q_GRANTS="SELECT count(*) FROM information_schema.role_table_grants WHERE table_schema='evo' AND grantee='authenticated' AND privilege_type IN ('INSERT','UPDATE','DELETE') AND table_name LIKE 'evolution_%'"

# executa_query <sql>: devolve a ultima linha (stdout+stderr juntos, sem null device)
executa_query() {
  local q="$1"
  if [ -n "${W10_PSQL:-}" ]; then
    $W10_PSQL -t -A -c "$q" 2>&1 | tail -n 1
  else
    ssh -i "$CHAVE" -p "$PORTA" -o BatchMode=yes -o ConnectTimeout=15 -o StrictHostKeyChecking=accept-new \
      "root@$HOST" "docker exec supabase_db psql -U postgres -d postgres -t -A -c \"$q\"" 2>&1 | tail -n 1
  fi
}

MSGS="$(executa_query "$Q_MSGS")"
DLQ="$(executa_query "$Q_DLQ")"
HEALTH="$(executa_query "$Q_HEALTH")"
GRANTS="$(executa_query "$Q_GRANTS")"

# health: saida esperada "score|grade"; sem pipe -> query/ssh falhou
if [[ "$HEALTH" == *"|"* ]]; then
  HEALTH_SCORE="${HEALTH%%|*}"
  HEALTH_GRADE="${HEALTH##*|}"
else
  HEALTH_SCORE="$HEALTH"
  HEALTH_GRADE="-"
fi

printf '%-22s %s\n' 'rotulo' "$ROTULO"
printf '%-22s %s\n' 'timestamp' "$TS"
printf '%-22s %s\n' 'msgs_24h' "$MSGS"
printf '%-22s %s\n' 'dlq' "$DLQ"
printf '%-22s %s\n' 'health_score' "$HEALTH_SCORE"
printf '%-22s %s\n' 'health_grade' "$HEALTH_GRADE"
printf '%-22s %s\n' 'grants_escrita_evo' "$GRANTS"

# fail-closed: se alguma metrica nao veio, falha (validacao final V3)
[ -n "${MSGS_24H:-}" ] && [ -n "${DLQ:-}" ] && [ -n "${HEALTH_SCORE:-}" ] || { echo "ERRO: medicao incompleta" >&2; exit 1; }
