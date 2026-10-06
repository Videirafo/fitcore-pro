#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
CONTAINER="${FITCORE_DB_CONTAINER:-fitcore_postgres}"
ROOT="${FITCORE_BACKUP_ROOT:-/var/backups/fitcore}"
KEY="${FITCORE_BACKUP_KEY_FILE:-/etc/fitcore/backup.passphrase}"
IMAGE="${FITCORE_RESTORE_IMAGE:-postgres:17.6-alpine}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$ROOT"
[[ -r "$KEY" ]] || { echo "missing backup key file: $KEY" >&2; exit 2; }
TMP="$(mktemp -d)"
RESTORE="fitcore-restore-$RANDOM-$$"
cleanup(){ docker rm -f "$RESTORE" >/dev/null 2>&1 || true; rm -rf "$TMP"; }
trap cleanup EXIT

docker inspect "$CONTAINER" >/dev/null
DUMP="$TMP/fitcore.dump"
docker exec "$CONTAINER" sh -lc 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc --no-owner --no-acl' > "$DUMP"
[[ -s "$DUMP" ]]
ENC="$ROOT/fitcore-$STAMP.dump.gpg"
gpg --batch --yes --pinentry-mode loopback --passphrase-file "$KEY" --symmetric --cipher-algo AES256 -o "$ENC" "$DUMP"
sha256sum "$ENC" > "$ENC.sha256"
gpg --batch --yes --pinentry-mode loopback --passphrase-file "$KEY" -o "$TMP/restore.dump" -d "$ENC"

docker run -d --rm --name "$RESTORE" -e POSTGRES_PASSWORD=restore -e POSTGRES_DB=restore "$IMAGE" >/dev/null
for _ in $(seq 1 80); do docker exec "$RESTORE" pg_isready -U postgres -d restore >/dev/null 2>&1 && break; sleep .25; done
docker cp "$TMP/restore.dump" "$RESTORE:/tmp/restore.dump"
docker exec "$RESTORE" pg_restore -U postgres -d restore --no-owner --no-acl /tmp/restore.dump >/dev/null
COUNT="$(docker exec "$RESTORE" psql -U postgres -d restore -Atqc "select count(*) from information_schema.tables where table_schema='public' and table_name='fitcore_tenants'")"
[[ "$COUNT" == "1" ]]
find "$ROOT" -type f -name 'fitcore-*.dump.gpg' -mtime +14 -delete
find "$ROOT" -type f -name 'fitcore-*.dump.gpg.sha256' -mtime +14 -delete
printf '{"ok":true,"system":"fitcore","created_at":"%s","encrypted":"%s","restore":"PASS"}\n' "$(date -u +%FT%TZ)" "$ENC" > "$ROOT/latest-evidence.json"
echo "FITCORE_BACKUP_RESTORE=PASS encrypted=$ENC"
