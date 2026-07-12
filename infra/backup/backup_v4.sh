#!/bin/sh
# SUPABASE SELF-HOSTED BACKUP SERVICE v4 (2026-07-09)
# Fix: chama ops.fn_update_backup_sentinel() apos cada backup bem-sucedido
# Deploy: montar em /backups/backup_v4.sh via volume do container supabase-backup
echo "=== SUPABASE SELF-HOSTED BACKUP SERVICE v4 (sentinel integrado) ==="
export PGPASSWORD=$(cat /run/secrets/supabase_db_password_v1)
apk add --no-cache --quiet gnupg minio-client >/dev/null 2>&1 || true
MC_BIN=$(command -v mcli || command -v mc || true)
if [ -z "$MC_BIN" ]; then
  wget -q -O /usr/local/bin/mc https://dl.min.io/client/mc/release/linux-amd64/mc && chmod +x /usr/local/bin/mc && MC_BIN=/usr/local/bin/mc
fi
echo "Target: ${PGHOST}:${PGPORT} db=${PGDATABASE} user=${PGUSER} | offsite: ${R2_BUCKET}/${R2_PREFIX} | guards: >=${MIN_SIZE_BYTES}B e >=${MIN_TABLES} TABLE DATA"
while true; do
  STAMP=$(date +%Y%m%d_%H%M%S)
  FILE="supabase_selfhosted_${STAMP}.dump"
  ERRLOG="/backups/last_error.log"
  echo "[${STAMP}] Starting pg_dump..."
  if ! pg_dump --no-owner --no-acl --format=custom --compress=6 \
       --file=/backups/${FILE} 2>>${ERRLOG}; then
    echo "[${STAMP}] FAIL pg_dump."
    touch /backups/BACKUP_FAILED_${STAMP}
    sleep 3600
    continue
  fi
  SIZE_BYTES=$(stat -c%s /backups/${FILE} 2>/dev/null || echo 0)
  SIZE_HUMAN=$(du -h /backups/${FILE} | cut -f1)
  TABLE_COUNT=$(pg_restore --list /backups/${FILE} 2>/dev/null | grep -c 'TABLE DATA' || echo 0)
  if [ "${SIZE_BYTES}" -lt "${MIN_SIZE_BYTES}" ] || [ "${TABLE_COUNT}" -lt "${MIN_TABLES}" ]; then
    echo "[${STAMP}] FAIL validacao: size=${SIZE_HUMAN} tables=${TABLE_COUNT}"
    mv /backups/${FILE} /backups/REJECTED_${FILE}
    touch /backups/BACKUP_FAILED_${STAMP}
    sleep 3600
    continue
  fi
  echo "[${STAMP}] validacao OK: ${SIZE_HUMAN}, ${TABLE_COUNT} TABLE DATA"
  sha256sum /backups/${FILE} > /backups/${FILE}.sha256
  echo "[${STAMP}] OK local: ${FILE} (${SIZE_HUMAN})"
  OFFSITE_OK=0
  if [ -n "${MC_BIN}" ]; then
    if gpg --batch --yes --symmetric --cipher-algo AES256 \
         --passphrase-file /run/secrets/backup_passphrase_v1 \
         -o /backups/${FILE}.gpg /backups/${FILE} 2>>${ERRLOG}; then
      ${MC_BIN} alias set r2 "${R2_ENDPOINT}" "$(cat /run/secrets/r2_backup_access_key_v1)" "$(cat /run/secrets/r2_backup_secret_key_v1)" >/dev/null 2>&1
      if ${MC_BIN} cp -q /backups/${FILE}.gpg /backups/${FILE}.sha256 r2/${R2_BUCKET}/${R2_PREFIX}/ 2>>${ERRLOG}; then
        OFFSITE_OK=1
        echo "[${STAMP}] OK offsite R2: ${R2_PREFIX}/${FILE}.gpg"
        ${MC_BIN} rm --recursive --force --older-than "${R2_RETENTION}" r2/${R2_BUCKET}/${R2_PREFIX}/ 2>/dev/null || true
      fi
      rm -f /backups/${FILE}.gpg
    fi
  fi
  if [ "${OFFSITE_OK}" != "1" ]; then
    echo "[${STAMP}] WARN offsite FALHOU."
    touch /backups/OFFSITE_FAILED_${STAMP}
  fi
  # FIX v4: atualizar sentinel de backup no Supabase
  OFFSITE_FLAG=false
  [ "${OFFSITE_OK}" = "1" ] && OFFSITE_FLAG=true
  SENTINEL_RESULT=$(psql -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" -d "${PGDATABASE}" -t -c \
    "SELECT ops.fn_update_backup_sentinel('${FILE}', ${SIZE_BYTES}, ${TABLE_COUNT}, ${OFFSITE_FLAG})" \
    2>&1)
  if echo "${SENTINEL_RESULT}" | grep -q 'updated'; then
    echo "[${STAMP}] OK sentinel: ${FILE} (${SIZE_BYTES}B, ${TABLE_COUNT} tabelas, offsite=${OFFSITE_FLAG})"
  else
    echo "[${STAMP}] WARN sentinel: resultado=${SENTINEL_RESULT}"
  fi
  find /backups -name "supabase_selfhosted_*.dump" -mtime +${RETENTION_DAYS} -delete
  find /backups -name "supabase_selfhosted_*.dump.sha256" -mtime +${RETENTION_DAYS} -delete
  find /backups -name "REJECTED_*" -mtime +30 -delete
  find /backups -name "BACKUP_FAILED_*" -mtime +30 -delete
  find /backups -name "OFFSITE_FAILED_*" -mtime +30 -delete
  COUNT=$(ls /backups/supabase_selfhosted_*.dump 2>/dev/null | wc -l)
  TOTAL_SIZE=$(du -sh /backups | cut -f1)
  echo "[${STAMP}] Retained local: ${COUNT} (total: ${TOTAL_SIZE}). Next backup in 24h."
  sleep 86400
done
