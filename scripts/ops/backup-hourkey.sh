#!/usr/bin/env bash
set -euo pipefail

STAMP=$(date -u +%Y%m%dT%H%M%SZ)
ROOT=${HOURKEY_BACKUP_DIR:-/var/www/backups/hourkey-db}
REMOTE=${HOURKEY_BACKUP_REMOTE:-r2:wewealth-erp-backup/hourkey-db}
KEEP_DAYS=${HOURKEY_BACKUP_KEEP_DAYS:-8}
DB_CONTAINER=${HOURKEY_DB_CONTAINER:-decode-postgres}
DIR="$ROOT/$STAMP"
RESTORE_DB="hourkey_restore_${STAMP//[^0-9]/}"

mkdir -p "$DIR"
chmod 700 "$ROOT" "$DIR"

cleanup() {
  docker exec "$DB_CONTAINER" sh -lc \
    'dropdb -U "$POSTGRES_USER" --if-exists '"$RESTORE_DB" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker exec "$DB_CONTAINER" sh -lc \
  'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$DIR/decode_db.dump"
test -s "$DIR/decode_db.dump"
sha256sum "$DIR/decode_db.dump" > "$DIR/decode_db.dump.sha256"

# A backup is not accepted until PostgreSQL can restore it into a clean DB.
docker exec "$DB_CONTAINER" sh -lc \
  'createdb -U "$POSTGRES_USER" '"$RESTORE_DB"
docker exec -i "$DB_CONTAINER" sh -lc \
  'pg_restore -U "$POSTGRES_USER" -d '"$RESTORE_DB"' --exit-on-error' < "$DIR/decode_db.dump"
docker exec "$DB_CONTAINER" sh -lc \
  'psql -U "$POSTGRES_USER" -d '"$RESTORE_DB"' -Atc "select count(*) from information_schema.tables where table_schema='"'"'public'"'"';"' \
  > "$DIR/restored_table_count"
test "$(cat "$DIR/restored_table_count")" -gt 0

readlink -f /root/releases/current > "$DIR/current_release"
if git -C /root/worktrees/decode-live-r481-baseline rev-parse HEAD > "$DIR/source_commit" 2>/dev/null; then :; fi
cp -a /etc/nginx/sites-enabled/hourkey.io "$DIR/hourkey.io.nginx"
chmod -R go-rwx "$DIR"

rclone copy "$DIR" "$REMOTE/$STAMP"
find "$ROOT" -mindepth 1 -maxdepth 1 -type d -mtime "+$KEEP_DAYS" -exec rm -rf -- {} +
printf 'backup_ok stamp=%s bytes=%s tables=%s\n' \
  "$STAMP" "$(stat -c %s "$DIR/decode_db.dump")" "$(cat "$DIR/restored_table_count")"
