#!/bin/sh
# ============================================================================
# evolution-db-purge v7 - PG14 (banco evolution) - retention & maintenance
# ----------------------------------------------------------------------------
# Roda em loop (PURGE_INTERVAL_HOURS) purgando tabelas de retencao em batch
# + VACUUM ANALYZE final. Conexao: PG_URL do secret pg_evolution_url_n8n_app_v1
# (role n8n_app - SEM ownership das tabelas; por isso NADA de REINDEX aqui).
#
# v7 (2026-08-06, A3-FIX pg14):
#   - FIX F1: _swarm_guardian_events (tabela REAL; v6 procurava o nome errado
#     evolution_guardian_events). Politica: detected_at < now()-30d (100% das
#     linhas tem resolved_at NULL - retencao por detected_at independe de
#     resolved). Mantido idx_sge_kind (serve exatamente esse DELETE).
#   - FIX F2: _audit_destructive (90d, coluna occurred_at) - novo no ciclo.
#   - FIX F4: _consumer_dlq com status='replayed' e resolved_at < now()-30d.
#   - FIX F6: logging retomado em _purge_runs (INSERT por tabela, so em ciclo
#     real; DRY_RUN nao grava).
#   - FIX F5: single-flight com pg_advisory_lock(42) (lock de sessao via psql
#     persistente). Se outro ciclo estiver rodando -> exit 0 sem purgar.
#   - DRY_RUN=1: imprime contagens (SELECT count) SEM executar DELETE.
#   - PGOPTIONS statement_timeout=30000 global (qualquer query que degringole
#     morre em 30s).
#   - Anti-join SEMPRE com NOT EXISTS (nunca NOT IN) - fix QA 2026-08-05.
#   - ASCII puro (sem acentos) - containers alpine/sh.
#   - REINDEX REMOVIDO: role n8n_app nao e owner (owner=postgres); VACUUM
#     ANALYZE nao exige ownership e cobre a manutencao.
#
# TABELAS E COLUNAS DE TEMPO (schema public, confirmado \d em 2026-08-06):
#   "Message"                 -> "messageTimestamp" (epoch int; >0 obrigatorio)
#   "MessageUpdate"           -> JOIN "Message"."messageTimestamp" + orfaos
#   evolution_webhook_events  -> occurred_at (14d)
#   _audit_outbound_trap      -> occurred_at (90d)
#   _baileys_error_events     -> observed_at (30d)
#   "IsOnWhatsapp"            -> "updatedAt" (7d)
#   _swarm_guardian_events    -> detected_at (30d)
#   _audit_destructive        -> occurred_at (90d)
#   _consumer_dlq             -> resolved_at (30d, so status='replayed')
#   warroom_alerts            -> created_at (30d)
#
# ENVS (todas com default):
#   PURGE_INTERVAL_HOURS=24 | MSG_RETENTION_DAYS=90 | MSGUPDATE_RETENTION_DAYS=30
#   WEBHOOK_RETENTION_DAYS=14 | BAILEYS_RETENTION_DAYS=30 | ISONWA_RETENTION_DAYS=7
#   GUARDIAN_RETENTION_DAYS=30 | AUDIT_RETENTION_DAYS=90 | DLQ_RETENTION_DAYS=30
#   WARROOM_RETENTION_DAYS=30 | BATCH_SIZE=50000
#   DRY_RUN=1 -> so contagens | RUN_ONCE=1 -> 1 ciclo e sai (sem loop)
# ============================================================================

set -e

PG_URL="$(cat /run/secrets/pg_evolution_url_n8n_app_v1)"
export PGOPTIONS="-c statement_timeout=30000"

log() { echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) [$1] $2"; }

num() { _v="$(printf '%s' "$1" | tr -dc '0-9')"; [ -n "$_v" ] && echo "$_v" || echo "0"; }

# run_query <sql>: psql silencioso (tag suprimida), stdout cru
run_query() { psql "$PG_URL" -q -tAc "$1" 2>/dev/null; }

# time_col <table_bare> <col1> [col2]: 1a coluna de tempo existente
time_col() {
  _t="$1"; shift
  for _c in "$@"; do
    _ok="$(run_query "SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='$_t' AND column_name='$_c'" | wc -l)"
    [ "$_ok" = "1" ] && { echo "$_c"; return 0; }
  done
  return 1
}

# purge_loop <sql_delete>: executa DELETE em batch (BATCH_SIZE) e devolve o
# total purgado na global PURGED (e imprime no stdout: "<total> rows").
purge_loop() {
  _sql="$1"
  _total=0
  while true; do
    _del="$(num "$(run_query "DELETE FROM $_sql RETURNING 1" | wc -l)")"
    _total=$((_total + _del))
    [ "$_del" -lt "${BATCH_SIZE:-50000}" ] && break
    sleep 2
  done
  PURGED="$_total"
}

# dry_count <label> <sql_count>: contagem p/ DRY_RUN (sem DELETE)
dry_count() {
  _label="$1"; _sql="$2"
  _n="$(num "$(run_query "SELECT count(*) FROM $_sql")")"
  log "INFO" "DRY_RUN $_label: $_n rows WOULD be purged (no DELETE)"
}

# log_run <tabela> <linhas> <inicio_epoch>: INSERT em _purge_runs (ciclo real)
log_run() {
  _tabela="$1"; _linhas="$2"; _inicio="$3"
  _dur=$(( ($(date +%s) - _inicio) * 1000 ))
  run_query "INSERT INTO _purge_runs (tabela, linhas_removidas, duration_ms) VALUES ('$_tabela', $_linhas, $_dur)" >/dev/null 2>&1 || \
    log "WARN" "_purge_runs: INSERT falhou para $_tabela (grant/coluna?)"
}

# purge_time <label> <tbl_sql> <col> <days>: DELETE em batch por coluna de tempo
purge_time() {
  _label="$1"; _tbl="$2"; _col="$3"; _days="$4"
  if [ "${DRY_RUN:-0}" = "1" ]; then
    dry_count "$_label" "$_tbl WHERE \"$_col\" < NOW() - INTERVAL '$_days days'"
    return 0
  fi
  purge_loop "$_tbl WHERE id IN (SELECT id FROM $_tbl WHERE \"$_col\" < NOW() - INTERVAL '$_days days' LIMIT ${BATCH_SIZE:-50000})"
  log "INFO" "$_label: $PURGED rows purged (retention ${_days}d, coluna $_col)"
}

# purge_message <label> <days>: "Message" via messageTimestamp (epoch, >0)
purge_message() {
  _label="$1"; _days="$2"
  if [ "${DRY_RUN:-0}" = "1" ]; then
    dry_count "$_label" "\"Message\" WHERE \"messageTimestamp\" > 0 AND \"messageTimestamp\" < EXTRACT(epoch FROM NOW() - INTERVAL '$_days days')::int"
    return 0
  fi
  purge_loop "\"Message\" WHERE id IN (SELECT id FROM \"Message\" WHERE \"messageTimestamp\" > 0 AND \"messageTimestamp\" < EXTRACT(epoch FROM NOW() - INTERVAL '$_days days')::int LIMIT ${BATCH_SIZE:-50000})"
  log "INFO" "$_label: $PURGED rows purged (retention ${_days}d, messageTimestamp>0)"
}

# purge_orphans <label> <tbl_sql> <fk_col> <ref_tbl_sql>: orfaos com NOT EXISTS
purge_orphans() {
  _label="$1"; _tbl="$2"; _fk="$3"; _ref="$4"
  if [ "${DRY_RUN:-0}" = "1" ]; then
    dry_count "$_label" "$_tbl WHERE NOT EXISTS (SELECT 1 FROM $_ref r WHERE r.id = $_tbl.$_fk)"
    return 0
  fi
  purge_loop "$_tbl WHERE id IN (SELECT id FROM $_tbl WHERE NOT EXISTS (SELECT 1 FROM $_ref r WHERE r.id = $_tbl.$_fk) LIMIT ${BATCH_SIZE:-50000})"
  log "INFO" "$_label: $PURGED rows purged (orfaos)"
}

# purge_msgupdate_join <label> <days>: MessageUpdate via JOIN Message
purge_msgupdate_join() {
  _label="$1"; _days="$2"
  if [ "${DRY_RUN:-0}" = "1" ]; then
    dry_count "$_label" "\"MessageUpdate\" mu JOIN \"Message\" m ON mu.\"messageId\" = m.id WHERE m.\"messageTimestamp\" > 0 AND m.\"messageTimestamp\" < EXTRACT(epoch FROM NOW() - INTERVAL '$_days days')::int"
    return 0
  fi
  purge_loop "\"MessageUpdate\" WHERE id IN (SELECT mu.id FROM \"MessageUpdate\" mu JOIN \"Message\" m ON mu.\"messageId\" = m.id WHERE m.\"messageTimestamp\" > 0 AND m.\"messageTimestamp\" < EXTRACT(epoch FROM NOW() - INTERVAL '$_days days')::int LIMIT ${BATCH_SIZE:-50000})"
  log "INFO" "$_label: $PURGED rows purged (retention ${_days}d, JOIN Message.messageTimestamp)"
}

# purge_dlq_resolved <label> <days>: _consumer_dlq resolved (status='replayed')
purge_dlq_resolved() {
  _label="$1"; _days="$2"
  if [ "${DRY_RUN:-0}" = "1" ]; then
    dry_count "$_label" "_consumer_dlq WHERE status='replayed' AND resolved_at IS NOT NULL AND resolved_at < NOW() - INTERVAL '$_days days'"
    return 0
  fi
  purge_loop "_consumer_dlq WHERE id IN (SELECT id FROM _consumer_dlq WHERE status='replayed' AND resolved_at IS NOT NULL AND resolved_at < NOW() - INTERVAL '$_days days' LIMIT ${BATCH_SIZE:-50000})"
  log "INFO" "$_label: $PURGED rows purged (retention ${_days}d, resolved)"
}

# ---------------------------------------------------------------------------
# Single-flight: pg_advisory_lock(42) em sessao psql persistente.
# Se outro ciclo ja detem o lock -> exit 0 (nao purga nada).
# ---------------------------------------------------------------------------
acquire_lock() {
  # sessao psql persistente que detem pg_advisory_lock(42) ate o fim do ciclo.
  # FIFO aberto O_RDWR (fd 3) no shell principal: nunca bloqueia, mantem o
  # pipe vivo e psql nao ve EOF -> sessao fica aberta segurando o lock.
  rm -f /tmp/purge_lock.fifo
  mkfifo /tmp/purge_lock.fifo
  exec 3<> /tmp/purge_lock.fifo
  PGAPPNAME=purge_v7_lock psql "$PG_URL" -q < /tmp/purge_lock.fifo >/dev/null 2>&1 &
  LOCK_HOLDER=$!
  echo "SELECT pg_try_advisory_lock(42);" >&3
  sleep 2
  _have="$(num "$(run_query "SELECT count(*) FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid WHERE l.locktype='advisory' AND l.granted AND a.application_name='purge_v7_lock'")")"
  if [ "$_have" != "1" ]; then
    kill "$LOCK_HOLDER" 2>/dev/null || true
    exec 3>&-
    rm -f /tmp/purge_lock.fifo
    log "INFO" "single-flight: lock 42 ja detido por outro ciclo - pulando (exit 0)"
    return 1
  fi
  log "INFO" "single-flight: lock 42 adquirido (holder pid $LOCK_HOLDER)"
  return 0
}

release_lock() {
  kill "$LOCK_HOLDER" 2>/dev/null || true
  exec 3>&-
  rm -f /tmp/purge_lock.fifo
  log "INFO" "single-flight: lock 42 liberado"
}

# ---------------------------------------------------------------------------
# 1 ciclo de purge
# ---------------------------------------------------------------------------
run_cycle() {
  log "INFO" "=== PURGE CYCLE v7 START ==="
  DRY="${DRY_RUN:-0}"

  # 1) "Message" - nunca tocar messageTimestamp=0 (retry logic)
  _s=$(date +%s); purge_message "Message" "${MSG_RETENTION_DAYS:-90}"
  [ "$DRY" != "1" ] && log_run "Message" "$PURGED" "$_s"

  # 2) "MessageUpdate" - JOIN Message.messageTimestamp + orfaos
  MU_COL="$(time_col "MessageUpdate" "updatedAt" "createdAt" || true)"
  if [ -n "$MU_COL" ]; then
    _s=$(date +%s); purge_time "MessageUpdate" '"MessageUpdate"' "$MU_COL" "${MSGUPDATE_RETENTION_DAYS:-30}"
    [ "$DRY" != "1" ] && log_run "MessageUpdate" "$PURGED" "$_s"
  else
    log "INFO" "MessageUpdate: sem updatedAt/createdAt - usando JOIN Message.messageTimestamp"
  fi
  _s=$(date +%s); purge_msgupdate_join "MessageUpdate" "${MSGUPDATE_RETENTION_DAYS:-30}"
  [ "$DRY" != "1" ] && log_run "MessageUpdate" "$PURGED" "$_s"
  _s=$(date +%s); purge_orphans "MessageUpdate (orphans)" '"MessageUpdate"' '"messageId"' '"Message"'
  [ "$DRY" != "1" ] && log_run "MessageUpdate (orphans)" "$PURGED" "$_s"

  # 3) evolution_webhook_events (occurred_at)
  WH_COL="$(time_col "evolution_webhook_events" "occurred_at" "created_at" "updated_at" || true)"
  if [ -n "$WH_COL" ]; then
    _s=$(date +%s); purge_time "evolution_webhook_events" "evolution_webhook_events" "$WH_COL" "${WEBHOOK_RETENTION_DAYS:-14}"
    [ "$DRY" != "1" ] && log_run "evolution_webhook_events" "$PURGED" "$_s"
  else
    log "WARN" "evolution_webhook_events: coluna occurred_at/created_at NAO encontrada - pulando"
  fi

  # 4) _audit_outbound_trap (occurred_at)
  AU_COL="$(time_col "_audit_outbound_trap" "occurred_at" "created_at" "updated_at" || true)"
  if [ -n "$AU_COL" ]; then
    _s=$(date +%s); purge_time "_audit_outbound_trap" "_audit_outbound_trap" "$AU_COL" "${AUDIT_RETENTION_DAYS:-90}"
    [ "$DRY" != "1" ] && log_run "_audit_outbound_trap" "$PURGED" "$_s"
  else
    log "WARN" "_audit_outbound_trap: coluna occurred_at/created_at NAO encontrada - pulando"
  fi

  # 5) _baileys_error_events (observed_at)
  BL_COL="$(time_col "_baileys_error_events" "observed_at" "created_at" "updated_at" || true)"
  if [ -n "$BL_COL" ]; then
    _s=$(date +%s); purge_time "_baileys_error_events" "_baileys_error_events" "$BL_COL" "${BAILEYS_RETENTION_DAYS:-30}"
    [ "$DRY" != "1" ] && log_run "_baileys_error_events" "$PURGED" "$_s"
  else
    log "WARN" "_baileys_error_events: coluna observed_at/created_at NAO encontrada - pulando"
  fi

  # 6) "IsOnWhatsapp" (updatedAt, TTL 7d)
  IW_COL="$(time_col "IsOnWhatsapp" "updatedAt" "createdAt" || true)"
  if [ -n "$IW_COL" ]; then
    _s=$(date +%s); purge_time "IsOnWhatsapp" '"IsOnWhatsapp"' "$IW_COL" "${ISONWA_RETENTION_DAYS:-7}"
    [ "$DRY" != "1" ] && log_run "IsOnWhatsapp" "$PURGED" "$_s"
  else
    log "WARN" "IsOnWhatsapp: coluna updatedAt/createdAt NAO encontrada - pulando"
  fi

  # 7) _swarm_guardian_events (detected_at, 30d) - FIX F1 (nome real + coluna real)
  SG_COL="$(time_col "_swarm_guardian_events" "detected_at" "created_at" || true)"
  if [ -n "$SG_COL" ]; then
    _s=$(date +%s); purge_time "_swarm_guardian_events" "_swarm_guardian_events" "$SG_COL" "${GUARDIAN_RETENTION_DAYS:-30}"
    [ "$DRY" != "1" ] && log_run "_swarm_guardian_events" "$PURGED" "$_s"
  else
    log "WARN" "_swarm_guardian_events: coluna detected_at/created_at NAO encontrada - pulando"
  fi

  # 8) _audit_destructive (occurred_at, 90d) - NOVO (F2)
  AD_COL="$(time_col "_audit_destructive" "occurred_at" "created_at" || true)"
  if [ -n "$AD_COL" ]; then
    _s=$(date +%s); purge_time "_audit_destructive" "_audit_destructive" "$AD_COL" "${AUDIT_RETENTION_DAYS:-90}"
    [ "$DRY" != "1" ] && log_run "_audit_destructive" "$PURGED" "$_s"
  else
    log "WARN" "_audit_destructive: coluna occurred_at/created_at NAO encontrada - pulando"
  fi

  # 9) _consumer_dlq resolved (30d) - NOVO (F4)
  _s=$(date +%s); purge_dlq_resolved "_consumer_dlq (replayed resolved)" "${DLQ_RETENTION_DAYS:-30}"
  [ "$DRY" != "1" ] && log_run "_consumer_dlq" "$PURGED" "$_s"

  # 10) warroom_alerts (created_at, 30d)
  WR_COL="$(time_col "warroom_alerts" "created_at" "updated_at" || true)"
  if [ -n "$WR_COL" ]; then
    _s=$(date +%s); purge_time "warroom_alerts" "warroom_alerts" "$WR_COL" "${WARROOM_RETENTION_DAYS:-30}"
    [ "$DRY" != "1" ] && log_run "warroom_alerts" "$PURGED" "$_s"
  else
    log "WARN" "warroom_alerts: coluna created_at/updated_at NAO encontrada - pulando"
  fi

  # 11) VACUUM ANALYZE final (nao exige ownership; REINDEX removido - role de app)
  if [ "$DRY" = "1" ]; then
    log "INFO" "DRY_RUN: VACUUM ANALYZE nao executado"
    return 0
  fi
  log "INFO" "VACUUM ANALYZE das tabelas purgadas..."
  if psql "$PG_URL" -c 'VACUUM ANALYZE "Message", "MessageUpdate", "IsOnWhatsapp", evolution_webhook_events, _audit_outbound_trap, _baileys_error_events, _swarm_guardian_events, _audit_destructive, _consumer_dlq, warroom_alerts' 2>/dev/null; then
    log "INFO" "VACUUM ANALYZE OK"
  else
    log "WARN" "VACUUM ANALYZE falhou (tabela inexistente?) - verificar schema"
  fi
}

# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------
log "INFO" "=== evolution-db-purge v7 iniciando ==="
if psql "$PG_URL" -tAc "SELECT 1" >/dev/null 2>&1; then
  log "INFO" "Conexao com o banco OK"
else
  log "ERROR" "Falha na conexao inicial com o banco - abortando"
  exit 1
fi

if [ "${RUN_ONCE:-0}" = "1" ]; then
  if acquire_lock; then
    run_cycle
    release_lock
  fi
  log "INFO" "RUN_ONCE=1 - ciclo unico concluido"
  exit 0
fi

while true; do
  if acquire_lock; then
    run_cycle
    release_lock
  fi
  sleep $(( ${PURGE_INTERVAL_HOURS:-24} * 3600 ))
done
