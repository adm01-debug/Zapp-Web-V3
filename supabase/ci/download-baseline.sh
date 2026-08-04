#!/usr/bin/env bash
# Downloads the canonical baseline schema from VPS backup storage.
# Run from the repository root. Requires: ssh access to VPS, or direct backup volume access.
#
# Baseline generated: 2026-08-04
# Source: pg_dump --schema-only --no-owner --no-acl -n zapp -n evo -n bpm -n email_app -n ai -n archive -n financeiro -n vendas -n ops
# Schemas covered: zapp (321 tables), evo (172 tables), bpm (41), email_app (33), ai (31), archive (25), financeiro (16), vendas (13), ops (20)
# Size: 533,090 bytes compressed / 3,692,805 bytes uncompressed / 105,770 lines / 704 CREATE TABLE statements
#
# SHA-256 checksums (also in baseline-schema-2026-08-04.sha256):
#   .gz  : cbdecfa97dc507475a135626feb004c80a8e31f2776e39260f0b74d2e2673b5c
#   .sql : 3e7dc8c32a9fc0135ec37c31fb2f1b63029fd1b69e1f9f6e2c1539cc075ea1b6

set -euo pipefail

DEST="$(dirname "$0")/baseline-schema-2026-08-04.sql"
GZ_DEST="${DEST}.gz"

# Option A: copy from backup container volume (if on the VPS host)
if command -v docker &>/dev/null; then
  BACKUP_CONTAINER=$(docker ps --filter name=backup --format '{{.ID}}' | head -1)
  if [[ -n "$BACKUP_CONTAINER" ]]; then
    echo "Copying from backup container $BACKUP_CONTAINER..."
    docker cp "${BACKUP_CONTAINER}:/backups/baseline-schema-2026-08-04.sql.gz" "$GZ_DEST"
    gzip -d "$GZ_DEST"
    echo "Done: $DEST"
    sha256sum "$DEST"
    exit 0
  fi
fi

# Option B: regenerate from live DB (requires psql and DB access)
if command -v pg_dump &>/dev/null && [[ -n "${PGPASSWORD:-}" ]]; then
  echo "Regenerating via pg_dump..."
  pg_dump \
    --schema-only \
    --no-owner \
    --no-acl \
    -n zapp -n evo -n bpm -n email_app -n ai -n archive \
    -n financeiro -n vendas -n ops \
    "${DATABASE_URL:-postgresql://postgres:${PGPASSWORD}@${PGHOST:-localhost}:5432/postgres}" \
    > "$DEST"
  echo "Done: $DEST"
  sha256sum "$DEST"
  exit 0
fi

echo "ERROR: Neither docker nor pg_dump is available. Cannot download baseline." >&2
echo "The file exists at /backups/baseline-schema-2026-08-04.sql.gz on the VPS backup container." >&2
exit 1
