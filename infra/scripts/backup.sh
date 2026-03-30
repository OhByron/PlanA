#!/bin/bash
# PlanA — PostgreSQL backup script
# Usage: ./backup.sh
#
# Runs pg_dump against the PlanA database and saves a compressed backup.
# Designed to be run via cron: 0 2 * * * /path/to/backup.sh
#
# Configuration via environment variables:
#   BACKUP_DIR     — where to store backups (default: /backups)
#   RETENTION_DAYS — how many days to keep old backups (default: 30)
#   PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE — standard PostgreSQL vars
#
# Note: make this file executable after cloning:
#   chmod +x infra/scripts/backup.sh

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FILENAME="plana_${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "[$(date)] Starting backup..."

pg_dump \
  --host="${PGHOST:-localhost}" \
  --port="${PGPORT:-5432}" \
  --username="${PGUSER:-plana}" \
  --dbname="${PGDATABASE:-plana}" \
  --no-owner \
  --no-acl \
  --format=plain \
  | gzip > "${BACKUP_DIR}/${FILENAME}"

echo "[$(date)] Backup saved: ${BACKUP_DIR}/${FILENAME} ($(du -h "${BACKUP_DIR}/${FILENAME}" | cut -f1))"

# Clean up old backups
DELETED=$(find "$BACKUP_DIR" -name "plana_*.sql.gz" -mtime +${RETENTION_DAYS} -delete -print | wc -l)
if [ "$DELETED" -gt 0 ]; then
  echo "[$(date)] Deleted ${DELETED} backup(s) older than ${RETENTION_DAYS} days"
fi

echo "[$(date)] Backup complete"
