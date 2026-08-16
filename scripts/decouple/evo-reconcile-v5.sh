#!/bin/sh
# reconcile-v5.sh — Evolution PG14 <-> Supabase mirror health check
# v5 (2026-08-16):
#   - SEGURANCA: postgres superuser -> role evo_reconciler (LOGIN, NOBYPASSRLS,
#     unica permissao = EXECUTE em ops.rpc_reconcile_snapshot). Zero DML direto.
#   - METRICA: COUNT(*) total de contatos era invalido (espelho acumula historico
#     desde 03/2026 + contatos de grupo/LID que a Evolution nao persiste em
#     "Contact"; a Evolution so tem dados desde 10/07). Delta ficava em ~147%
#     permanente e o threshold hardcoded de 500% mascarava tudo como healthy.
#     Substituido por COBERTURA: quantos remoteJid da Evolution nao existem no
#     espelho, separando @lid (esperado, pendente de resolucao) de nao-LID
#     (falha real de replicacao de contacts.upsert). Alerta em missing_nonlid>10.
#   - Toda a logica de status/threshold vive na funcao SQL, nao no shell.
set -eu
log() { echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) [$1] $2"; }
die() { log FATAL "$1"; exit 1; }
: "${RECONCILE_INTERVAL:=900}"
PG_EVO_URL=$(cat /run/secrets/pg_evolution_url_n8n_app_v1 2>/dev/null) || die 'secret pg_evolution nao encontrado'
PG_SUPA_URL=$(cat /run/secrets/pg_supa_url_evo_reconciler_v1 2>/dev/null) || die 'secret evo_reconciler nao encontrado'
WEBHOOK_URL="${ALERT_WEBHOOK_URL:-}"
log INFO "reconcile-v5 iniciado (intervalo=${RECONCILE_INTERVAL}s role=evo_reconciler metrica=cobertura)"
while true; do
  src_msg=$(psql "$PG_EVO_URL" -tAq -c 'SELECT COUNT(*) FROM "Message"' 2>/dev/null || echo 0)
  src_contact=$(psql "$PG_EVO_URL" -tAq -c 'SELECT COUNT(*) FROM "Contact"' 2>/dev/null || echo 0)
  src_chat=$(psql "$PG_EVO_URL" -tAq -c 'SELECT COUNT(*) FROM "Chat"' 2>/dev/null || echo 0)

  # cobertura: JIDs presentes na Evolution e ausentes no espelho
  miss_nonlid=0; miss_lid=0
  if psql "$PG_EVO_URL" -tAq -c 'SELECT "remoteJid" FROM "Contact"' 2>/dev/null | sort -u > /tmp/evo_jids.txt \
     && psql "$PG_SUPA_URL" -tAq -c "SELECT jid FROM ops.rpc_reconcile_mirror_jids()" 2>/dev/null | sort -u > /tmp/mir_jids.txt; then
    comm -23 /tmp/evo_jids.txt /tmp/mir_jids.txt > /tmp/falt.txt 2>/dev/null || true
    miss_lid=$(grep -c '@lid' /tmp/falt.txt 2>/dev/null || echo 0)
    miss_nonlid=$(grep -vc '@lid' /tmp/falt.txt 2>/dev/null || echo 0)
  else
    log WARN 'cobertura nao calculada (falha ao obter JIDs); enviando -1'
    miss_nonlid=-1; miss_lid=-1
  fi

  RES=$(psql "$PG_SUPA_URL" -tAq -c "SELECT ops.rpc_reconcile_snapshot(${src_msg},${src_contact},${src_chat},${miss_nonlid},${miss_lid})" 2>&1) || {
    log ERROR "rpc_reconcile_snapshot falhou: $(printf '%s' "$RES" | head -c 300)"
    sleep "$RECONCILE_INTERVAL"; continue
  }
  status=$(printf '%s' "$RES" | sed -n 's/.*"status"[ ]*:[ ]*"\([^"]*\)".*/\1/p')
  erros=$(printf '%s' "$RES" | sed -n 's/.*"erros"[ ]*:[ ]*"\([^"]*\)".*/\1/p')
  log INFO "src msg=${src_msg} contact=${src_contact} chat=${src_chat} | missing nonlid=${miss_nonlid} lid=${miss_lid} | ${RES}"

  if [ -n "$erros" ]; then
    log WARN "$erros"
    if [ -n "$WEBHOOK_URL" ]; then
      PAYLOAD="{\"service\":\"evo-reconcile-v5\",\"status\":\"${status}\",\"erros\":\"$(printf '%s' "$erros" | head -c 200)\",\"missing_nonlid\":${miss_nonlid},\"missing_lid\":${miss_lid}}"
      wget -qO- --post-data="$PAYLOAD" --header='Content-Type: application/json' --timeout=10 "$WEBHOOK_URL" >/dev/null 2>&1 \
        && log INFO 'webhook alert enviado' || log WARN 'webhook alert falhou'
    else
      log WARN 'ALERT_WEBHOOK_URL nao configurado - alerta nao enviado'
    fi
  fi
  log INFO "ciclo concluido; proximo em ${RECONCILE_INTERVAL}s"
  sleep "$RECONCILE_INTERVAL"
done
