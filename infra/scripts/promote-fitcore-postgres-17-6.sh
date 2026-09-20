#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE="$ROOT/infra/docker/fitcore-postgres.compose.yml"
ENV_FILE="${FITCORE_POSTGRES_ENV_FILE:-/opt/fitcore-pro/storage/secrets/fitcore-postgres.env}"
API_SERVICE="${FITCORE_API_SERVICE:-fitcore-api.service}"
PUBLIC_URL="${FITCORE_PUBLIC_URL:-https://fitcore.marcaia.app}"
OLD_CONTAINER="fitcore_postgres"
OLD_VOLUME="docker_fitcore-postgres-data"
OLD_IMAGE=""
NEW_VOLUME="docker_fitcore-postgres17-data"
BACKUP_ROOT="${FITCORE_POSTGRES_BACKUP_ROOT:-/opt/backups/fitcore-postgres}"

[[ $EUID -eq 0 ]] || { echo "ERRO: execute como root." >&2; exit 1; }
for bin in docker systemctl curl sha256sum pg_restore; do
  command -v "$bin" >/dev/null 2>&1 || { echo "ERRO: comando ausente: $bin" >&2; exit 2; }
done
[[ -f "$COMPOSE" ]] || { echo "ERRO: compose ausente." >&2; exit 3; }
[[ -f "$ENV_FILE" ]] || { echo "ERRO: env PostgreSQL ausente." >&2; exit 4; }

DB_USER="$(sed -n 's/^POSTGRES_USER=//p' "$ENV_FILE" | head -1)"
DB_NAME="$(sed -n 's/^POSTGRES_DB=//p' "$ENV_FILE" | head -1)"
[[ -n "$DB_USER" && -n "$DB_NAME" ]] || { echo "ERRO: POSTGRES_USER/POSTGRES_DB ausentes." >&2; exit 5; }

OLD_CID="$(docker ps -qf "name=^${OLD_CONTAINER}$" | head -1)"
[[ -n "$OLD_CID" ]] || { echo "ERRO: container PostgreSQL atual não está ativo." >&2; exit 6; }
OLD_IMAGE="$(docker inspect "$OLD_CID" --format "{{.Image}}")"
OLD_VERSION="$(docker exec "$OLD_CID" psql -U "$DB_USER" -d "$DB_NAME" -Atqc "show server_version")"
[[ "$OLD_VERSION" == 16.* ]] || { echo "ERRO: origem esperada PostgreSQL 16; encontrado $OLD_VERSION." >&2; exit 7; }

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_DIR="$BACKUP_ROOT/pg16-final-before-17-$STAMP"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
ROLLBACK_REQUIRED=0

wait_db() {
  local tries="${1:-80}"
  for _ in $(seq 1 "$tries"); do
    if docker exec "$OLD_CONTAINER" pg_isready -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.5
  done
  return 1
}

wait_postgres17_stable() {
  local tries="${1:-160}"
  local health=""
  local version=""
  local version2=""
  for _ in $(seq 1 "$tries"); do
    health="$(docker inspect "$OLD_CONTAINER" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' 2>/dev/null || true)"
    version="$(docker exec "$OLD_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -Atqc "show server_version" 2>/dev/null || true)"
    if [[ "$health" == "healthy" && "$version" == 17.6* ]]; then
      sleep 2
      version2="$(docker exec "$OLD_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -Atqc "show server_version" 2>/dev/null || true)"
      if [[ "$version2" == 17.6* ]]; then
        printf '%s' "$version2"
        return 0
      fi
    fi
    sleep 0.5
  done
  return 1
}

restart_api() {
  systemctl start "$API_SERVICE"
  for _ in $(seq 1 50); do
    curl -fsS --max-time 3 http://127.0.0.1:8091/api/health >/dev/null 2>&1 && return 0
    sleep 0.5
  done
  return 1
}

rollback() {
  local code=$?
  trap - ERR
  set +e
  echo "postgres17_promotion=FAIL rollback=START code=$code" >&2
  if [[ "$ROLLBACK_REQUIRED" -eq 1 ]]; then
    docker rm -f "$OLD_CONTAINER" >/dev/null 2>&1 || true
    docker run -d --name "$OLD_CONTAINER" --restart unless-stopped \
      --env-file "$ENV_FILE" \
      -p 127.0.0.1:55435:5432 \
      -v "$OLD_VOLUME:/var/lib/postgresql/data" \
      "$OLD_IMAGE" >/dev/null || true
    wait_db 80 || true
  fi
  restart_api || true
  exit "$code"
}
trap rollback ERR

echo "=== PostgreSQL 16 -> 17.6 controlled promotion ==="
echo "source_version=$OLD_VERSION"
systemctl stop "$API_SERVICE"

OLD_COUNTS="$(docker exec "$OLD_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -AtF '|' -c "
SELECT
  (SELECT count(*) FROM fitcore_tenants),
  (SELECT count(*) FROM fitcore_users),
  (SELECT count(*) FROM fitcore_students),
  (SELECT count(*) FROM fitcore_workouts),
  (SELECT count(*) FROM fitcore_workout_executions),
  (SELECT count(*) FROM fitcore_schema_migrations);
")"

docker exec "$OLD_CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc > "$BACKUP_DIR/fitcore.dump"
docker exec "$OLD_CONTAINER" pg_dumpall -U "$DB_USER" --globals-only > "$BACKUP_DIR/globals.sql"
chmod 600 "$BACKUP_DIR/fitcore.dump" "$BACKUP_DIR/globals.sql"
pg_restore -l "$BACKUP_DIR/fitcore.dump" >/dev/null
sha256sum "$BACKUP_DIR/fitcore.dump" > "$BACKUP_DIR/SHA256SUMS"
echo "backup_validation=PASS"
echo "backup_path=$BACKUP_DIR"

docker rm -f "$OLD_CONTAINER" >/dev/null
ROLLBACK_REQUIRED=1

docker compose -p docker -f "$COMPOSE" up -d fitcore_postgres >/dev/null
NEW_VERSION="$(wait_postgres17_stable 160)"
[[ "$NEW_VERSION" == 17.6* ]] || { echo "ERRO: destino PostgreSQL 17.6 não ficou estável/healthy." >&2; false; }
echo "postgres17_readiness=PASS version=$NEW_VERSION"

docker exec -i "$OLD_CONTAINER" pg_restore \
  -U "$DB_USER" -d "$DB_NAME" \
  --clean --if-exists --no-owner --exit-on-error \
  < "$BACKUP_DIR/fitcore.dump" >/dev/null

NEW_COUNTS="$(docker exec "$OLD_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -AtF '|' -c "
SELECT
  (SELECT count(*) FROM fitcore_tenants),
  (SELECT count(*) FROM fitcore_users),
  (SELECT count(*) FROM fitcore_students),
  (SELECT count(*) FROM fitcore_workouts),
  (SELECT count(*) FROM fitcore_workout_executions),
  (SELECT count(*) FROM fitcore_schema_migrations);
")"
[[ "$NEW_COUNTS" == "$OLD_COUNTS" ]] || {
  echo "ERRO: contagens divergiram após restore." >&2
  false
}

docker exec "$OLD_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -Atqc \
  "select 1 from pg_extension where extname='pgcrypto'" | grep -qx 1
docker volume inspect "$OLD_VOLUME" >/dev/null
docker volume inspect "$NEW_VOLUME" >/dev/null

restart_api
curl -fsS --max-time 8 "$PUBLIC_URL/api/health" >/dev/null

ROLLBACK_REQUIRED=0
trap - ERR

echo "postgres17_promotion=PASS"
echo "source_version=$OLD_VERSION"
echo "target_version=$NEW_VERSION"
echo "counts=$NEW_COUNTS"
echo "old_volume_preserved=$OLD_VOLUME"
echo "new_volume=$NEW_VOLUME"
echo "backup_path=$BACKUP_DIR"
