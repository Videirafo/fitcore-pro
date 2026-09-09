#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
API_BASE="${FITCORE_PUBLIC_API_BASE:-https://fitcore.marcaia.app}"
SECRETS_FILE="$ROOT/storage/secrets/fitcore-postgres.env"

cd "$ROOT"

echo "MVP-13 — verificando painel operacional com PostgresStore"

if ! curl -fsS "$API_BASE/api/mvp-10/postgres-store" | grep -q '"active_store": "PostgresStore"'; then
  echo "ERRO: endpoint público não confirma PostgresStore ativo." >&2
  exit 1
fi

echo "OK: PostgresStore ativo no endpoint público."

for endpoint in \
  "/api/mvp-01/aluno-treino?limit=3" \
  "/api/mvp-02/checkins?limit=3" \
  "/api/mvp-03/professor/contexto"; do
  curl -fsS "$API_BASE$endpoint" >/tmp/fitcore-mvp13-api.json
  python3 -m json.tool /tmp/fitcore-mvp13-api.json >/dev/null
  echo "OK: $endpoint"
done

if ! curl -fsSI "$API_BASE/mvp-13.html" | grep -q "HTTP/2 200\|HTTP/1.1 200"; then
  echo "ERRO: página MVP-13 não respondeu 200." >&2
  exit 1
fi

echo "OK: /mvp-13.html publicado."

if [[ -f "$SECRETS_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  . "$SECRETS_FILE"
  set +a
  DB_URL="${FITCORE_DATABASE_URL:-${DATABASE_URL:-}}"
  if [[ -z "$DB_URL" && -n "${POSTGRES_USER:-}" && -n "${POSTGRES_PASSWORD:-}" && -n "${POSTGRES_DB:-}" ]]; then
    DB_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:55435/${POSTGRES_DB}?sslmode=disable"
  fi

  if [[ -n "$DB_URL" ]]; then
    psql "$DB_URL" -X -A -t -q -v ON_ERROR_STOP=1 -c "
      WITH tenant AS (SELECT id FROM fitcore_tenants WHERE slug='demo' LIMIT 1),
      scope AS (SELECT set_config('app.tenant_id', (SELECT id::text FROM tenant), true))
      SELECT jsonb_build_object(
        'tenants', (SELECT count(*) FROM fitcore_tenants),
        'workouts', (SELECT count(*) FROM fitcore_workouts, scope WHERE tenant_id=(SELECT id FROM tenant)),
        'reviews', (SELECT count(*) FROM fitcore_professor_reviews, scope WHERE tenant_id=(SELECT id FROM tenant)),
        'executions', (SELECT count(*) FROM fitcore_workout_executions, scope WHERE tenant_id=(SELECT id FROM tenant)),
        'audit_events', (SELECT count(*) FROM fitcore_audit_events, scope WHERE tenant_id=(SELECT id FROM tenant))
      )::text;
    " | python3 -m json.tool
  else
    echo "AVISO: DB_URL não resolvida; verificação via API já passou."
  fi
else
  echo "AVISO: segredo local não encontrado; verificação via API já passou."
fi

echo "MVP-13 verificado: painel operacional lê dados reais via API com PostgresStore ativo."
