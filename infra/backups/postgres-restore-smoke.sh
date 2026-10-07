#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

fail(){ printf '[restore-smoke] FAIL: %s\n' "$*" >&2; exit 1; }
need(){ command -v "$1" >/dev/null 2>&1 || fail "$1 obrigatório"; }

need docker
need sha256sum
need date

MODE=""
if [[ -n "${TRUST_DB_CONTAINER:-}" ]]; then
  MODE="container"
  [[ "${TRUST_DB_CONTAINER}" =~ ^[A-Za-z0-9_.-]+$ ]] || fail "TRUST_DB_CONTAINER inválido"
  [[ "${TRUST_DB_USER:-}" =~ ^[A-Za-z0-9_.-]+$ ]] || fail "TRUST_DB_USER inválido"
  [[ "${TRUST_DB_NAME:-}" =~ ^[A-Za-z0-9_.-]+$ ]] || fail "TRUST_DB_NAME inválido"
else
  MODE="url"
  [[ -n "${DATABASE_URL:-}" ]] || fail "defina TRUST_DB_CONTAINER ou DATABASE_URL"
  need pg_dump
  need pg_restore
fi

ROOT="${TRUST_RECOVERY_WORKDIR:-$(mktemp -d)}"
mkdir -p "$ROOT"
chmod 700 "$ROOT"
DUMP="$ROOT/source.dump"
LISTING="$ROOT/source.list"
RESTORE_NAME="trust-restore-${RANDOM}-$$"
RESTORE_DB="trust_restore"
RESTORE_PASSWORD="trust-${RANDOM}-${RANDOM}-$$"
EVIDENCE="${TRUST_RECOVERY_EVIDENCE:-$PWD/.trust-runtime/recovery-evidence.json}"
STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
EXTERNAL_STATUS="not_configured"

cleanup(){
  docker rm -f "$RESTORE_NAME" >/dev/null 2>&1 || true
  if [[ "${TRUST_KEEP_DUMP:-false}" != "true" ]]; then rm -f "$DUMP" "$LISTING"; fi
}
trap cleanup EXIT

if [[ "$MODE" == "container" ]]; then
  docker exec "$TRUST_DB_CONTAINER" pg_dump -U "$TRUST_DB_USER" -d "$TRUST_DB_NAME" -Fc --no-owner --no-acl > "$DUMP"
  docker exec -i "$TRUST_DB_CONTAINER" pg_restore -l < "$DUMP" > "$LISTING"
else
  pg_dump "$DATABASE_URL" -Fc --no-owner --no-acl -f "$DUMP"
  pg_restore -l "$DUMP" > "$LISTING"
fi

[[ -s "$DUMP" ]] || fail "dump vazio"
grep -Eq 'TABLE|TABLE DATA' "$LISTING" || fail "dump sem tabelas"
DUMP_SHA="$(sha256sum "$DUMP" | awk '{print $1}')"

docker run -d --rm --name "$RESTORE_NAME"   -e POSTGRES_PASSWORD="$RESTORE_PASSWORD"   -e POSTGRES_DB="$RESTORE_DB"   postgres:17.6-alpine >/dev/null

ready=0
for _ in $(seq 1 80); do
  if docker exec "$RESTORE_NAME" pg_isready -U postgres -d "$RESTORE_DB" >/dev/null 2>&1; then
    ready=$((ready+1))
    [[ "$ready" -ge 2 ]] && break
  else
    ready=0
  fi
  sleep 0.5
done
[[ "$ready" -ge 2 ]] || fail "PostgreSQL 17.6 isolado não ficou estável"

cat "$DUMP" | docker exec -i "$RESTORE_NAME" pg_restore -U postgres -d "$RESTORE_DB" --no-owner --no-acl --exit-on-error >/dev/null
TABLE_COUNT="$(docker exec "$RESTORE_NAME" psql -U postgres -d "$RESTORE_DB" -Atqc "select count(*) from pg_catalog.pg_tables where schemaname='public'")"
[[ "$TABLE_COUNT" =~ ^[0-9]+$ ]] || fail "table_count inválido"
(( TABLE_COUNT > 0 )) || fail "restore sem tabelas públicas"

if [[ -n "${TRUST_BACKUP_TARGET_DIR:-}" ]]; then
  need age
  [[ -n "${TRUST_BACKUP_AGE_RECIPIENT:-}" ]] || fail "TRUST_BACKUP_AGE_RECIPIENT obrigatório"
  mkdir -p "$TRUST_BACKUP_TARGET_DIR"
  chmod 700 "$TRUST_BACKUP_TARGET_DIR" || true
  TARGET="$TRUST_BACKUP_TARGET_DIR/$(date -u +%Y%m%dT%H%M%SZ)-${TRUST_SYSTEM:-fitcore-pro}.dump.age"
  age -r "$TRUST_BACKUP_AGE_RECIPIENT" -o "$TARGET" "$DUMP"
  chmod 600 "$TARGET"
  [[ -s "$TARGET" ]] || fail "cópia externa criptografada vazia"
  EXTERNAL_STATUS="pass"
fi

mkdir -p "$(dirname "$EVIDENCE")"
chmod 700 "$(dirname "$EVIDENCE")" || true
COMPLETED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
cat > "$EVIDENCE" <<JSON
{
  "version": 1,
  "system": "${TRUST_SYSTEM:-fitcore-pro}",
  "started_at": "$STARTED_AT",
  "completed_at": "$COMPLETED_AT",
  "restore_status": "pass",
  "postgres_version": "17.6",
  "public_table_count": $TABLE_COUNT,
  "dump_sha256": "$DUMP_SHA",
  "external_copy_status": "$EXTERNAL_STATUS"
}
JSON
chmod 600 "$EVIDENCE"
printf '[restore-smoke] PASS system=%s tables=%s evidence=%s external=%s\n' "${TRUST_SYSTEM:-fitcore-pro}" "$TABLE_COUNT" "$EVIDENCE" "$EXTERNAL_STATUS"
