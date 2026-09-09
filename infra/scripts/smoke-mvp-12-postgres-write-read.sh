#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
API_BASE="${FITCORE_PUBLIC_API_BASE:-https://fitcore.marcaia.app}"
SECRETS_FILE="$ROOT_DIR/storage/secrets/fitcore-postgres.env"
SMOKE_DIR="$ROOT_DIR/storage/mvp-12"
SMOKE_ID="mvp12-$(date -u +%Y%m%dT%H%M%SZ)-$RANDOM"
DEFAULT_DB_HOST="127.0.0.1"
DEFAULT_DB_PORT="55435"

mkdir -p "$SMOKE_DIR"
cd "$ROOT_DIR"

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "ERRO: comando obrigatório ausente: $1" >&2
    exit 1
  fi
}

json_get() {
  local file="$1"
  local expr="$2"
  python3 - "$file" "$expr" <<'PY'
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
expr = sys.argv[2]
data = json.loads(path.read_text(encoding="utf-8"))
value = data
for part in expr.split('.'):
    if isinstance(value, list):
        value = value[int(part)]
    else:
        value = value.get(part)
print("" if value is None else value)
PY
}

post_json() {
  local url="$1"
  local payload="$2"
  local output="$3"
  curl -fsS \
    -H "content-type: application/json" \
    -X POST \
    --data "$payload" \
    "$url" > "$output"
}

patch_json() {
  local url="$1"
  local payload="$2"
  local output="$3"
  curl -fsS \
    -H "content-type: application/json" \
    -X PATCH \
    --data "$payload" \
    "$url" > "$output"
}

urlencode_component() {
  python3 - "$1" <<'PY'
import sys
from urllib.parse import quote
print(quote(sys.argv[1], safe=""))
PY
}

resolve_database_url() {
  local db_url="${FITCORE_DATABASE_URL:-${DATABASE_URL:-}}"

  if [[ -n "$db_url" ]]; then
    printf '%s' "$db_url"
    return 0
  fi

  if [[ -f "$SECRETS_FILE" ]]; then
    # shellcheck disable=SC1090
    source "$SECRETS_FILE"
    db_url="${FITCORE_DATABASE_URL:-${DATABASE_URL:-}}"

    if [[ -n "$db_url" ]]; then
      printf '%s' "$db_url"
      return 0
    fi

    if [[ -n "${POSTGRES_USER:-}" && -n "${POSTGRES_PASSWORD:-}" && -n "${POSTGRES_DB:-}" ]]; then
      local db_host="${FITCORE_DB_HOST:-$DEFAULT_DB_HOST}"
      local db_port="${FITCORE_DB_PORT:-$DEFAULT_DB_PORT}"
      local enc_user
      local enc_pass
      local enc_db
      enc_user="$(urlencode_component "$POSTGRES_USER")"
      enc_pass="$(urlencode_component "$POSTGRES_PASSWORD")"
      enc_db="$(urlencode_component "$POSTGRES_DB")"
      printf 'postgresql://%s:%s@%s:%s/%s?sslmode=disable' "$enc_user" "$enc_pass" "$db_host" "$db_port" "$enc_db"
      return 0
    fi
  fi

  if [[ -f /etc/systemd/system/fitcore-api.service.d/10-fitcore-persistence.conf ]]; then
    db_url="$(grep -Eo 'FITCORE_DATABASE_URL=[^"]+' /etc/systemd/system/fitcore-api.service.d/10-fitcore-persistence.conf | head -n 1 | sed 's/^FITCORE_DATABASE_URL=//' || true)"
    if [[ -n "$db_url" ]]; then
      printf '%s' "$db_url"
      return 0
    fi
  fi

  return 1
}

need curl
need python3
need psql

if [[ ! -f "$SECRETS_FILE" ]]; then
  echo "ERRO: segredo do banco não encontrado: $SECRETS_FILE" >&2
  echo "Rode antes: bash infra/scripts/setup-mvp-11-fitcore-postgres.sh" >&2
  exit 1
fi

if ! DB_URL="$(resolve_database_url)"; then
  echo "ERRO: não foi possível resolver a URL do PostgreSQL." >&2
  echo "Fontes aceitas:" >&2
  echo "  - FITCORE_DATABASE_URL ou DATABASE_URL no ambiente" >&2
  echo "  - POSTGRES_DB/POSTGRES_USER/POSTGRES_PASSWORD em $SECRETS_FILE" >&2
  echo "  - drop-in /etc/systemd/system/fitcore-api.service.d/10-fitcore-persistence.conf" >&2
  exit 1
fi

STATUS_FILE="$SMOKE_DIR/${SMOKE_ID}-adapter.json"
curl -fsS "$API_BASE/api/mvp-10/postgres-store" > "$STATUS_FILE"
ACTIVE_STORE="$(json_get "$STATUS_FILE" active_store)"
POSTGRES_READY="$(json_get "$STATUS_FILE" postgres.ready)"

if [[ "$ACTIVE_STORE" != "PostgresStore" || "$POSTGRES_READY" != "True" && "$POSTGRES_READY" != "true" ]]; then
  echo "ERRO: API ainda não está usando PostgresStore pronto." >&2
  cat "$STATUS_FILE" >&2
  exit 1
fi

echo "OK: API usando PostgresStore."

WORKOUT_FILE="$SMOKE_DIR/${SMOKE_ID}-workout.json"
REVIEW_FILE="$SMOKE_DIR/${SMOKE_ID}-review.json"
APPROVE_FILE="$SMOKE_DIR/${SMOKE_ID}-review-approved.json"
CHECKIN_FILE="$SMOKE_DIR/${SMOKE_ID}-checkin.json"
DONE_FILE="$SMOKE_DIR/${SMOKE_ID}-checkin-done.json"
LIST_FILE="$SMOKE_DIR/${SMOKE_ID}-list.json"
DB_FILE="$SMOKE_DIR/${SMOKE_ID}-db.json"

ALUNO_NOME="Aluno Smoke MVP-12 ${SMOKE_ID}"
PROFESSOR_NOME="Professor Smoke MVP-12"

post_json "$API_BASE/api/mvp-01/aluno-treino" "$(cat <<JSON
{
  "aluno_nome": "$ALUNO_NOME",
  "objetivo": "hipertrofia",
  "nivel": "iniciante",
  "modalidade": "academia",
  "foco": "pernas",
  "dias_semana": 3,
  "observacoes": "Smoke MVP-12: dados mínimos sem informação sensível."
}
JSON
)" "$WORKOUT_FILE"

WORKOUT_ID="$(json_get "$WORKOUT_FILE" id)"
if [[ -z "$WORKOUT_ID" ]]; then
  echo "ERRO: API não retornou id do treino." >&2
  cat "$WORKOUT_FILE" >&2
  exit 1
fi

echo "OK: treino criado: $WORKOUT_ID"

post_json "$API_BASE/api/mvp-03/professor/reviews" "$(cat <<JSON
{
  "treino_id": "$WORKOUT_ID",
  "professor_nome": "$PROFESSOR_NOME",
  "papel": "professor",
  "observacoes": "Smoke MVP-12: revisão técnica mínima."
}
JSON
)" "$REVIEW_FILE"

REVIEW_ID="$(json_get "$REVIEW_FILE" id)"
if [[ -z "$REVIEW_ID" ]]; then
  echo "ERRO: API não retornou id da revisão." >&2
  cat "$REVIEW_FILE" >&2
  exit 1
fi

echo "OK: revisão criada: $REVIEW_ID"

patch_json "$API_BASE/api/mvp-03/professor/reviews/$REVIEW_ID/approve" "$(cat <<JSON
{
  "papel": "professor",
  "observacoes": "Smoke MVP-12: treino aprovado para validação."
}
JSON
)" "$APPROVE_FILE"

APPROVED_STATUS="$(json_get "$APPROVE_FILE" status)"
if [[ "$APPROVED_STATUS" != "aprovado" ]]; then
  echo "ERRO: revisão não foi aprovada." >&2
  cat "$APPROVE_FILE" >&2
  exit 1
fi

echo "OK: revisão aprovada."

post_json "$API_BASE/api/mvp-02/checkins" "$(cat <<JSON
{
  "treino_id": "$WORKOUT_ID",
  "aluno_nome": "$ALUNO_NOME",
  "dia_treino": "Dia 1",
  "status": "em_execucao",
  "papel": "aluno",
  "percepcao_esforco": 6,
  "duracao_minutos": 42,
  "observacoes": "Smoke MVP-12: início de execução sem dado sensível."
}
JSON
)" "$CHECKIN_FILE"

CHECKIN_ID="$(json_get "$CHECKIN_FILE" id)"
if [[ -z "$CHECKIN_ID" ]]; then
  echo "ERRO: API não retornou id do check-in." >&2
  cat "$CHECKIN_FILE" >&2
  exit 1
fi

echo "OK: check-in criado: $CHECKIN_ID"

patch_json "$API_BASE/api/mvp-02/checkins/$CHECKIN_ID/status" "$(cat <<JSON
{
  "status": "concluido",
  "papel": "aluno",
  "percepcao_esforco": 7,
  "duracao_minutos": 48,
  "observacoes": "Smoke MVP-12: conclusão validada."
}
JSON
)" "$DONE_FILE"

CHECKIN_STATUS="$(json_get "$DONE_FILE" status)"
if [[ "$CHECKIN_STATUS" != "concluido" ]]; then
  echo "ERRO: check-in não ficou concluído." >&2
  cat "$DONE_FILE" >&2
  exit 1
fi

echo "OK: check-in concluído."

curl -fsS "$API_BASE/api/mvp-01/aluno-treino?limit=10" > "$LIST_FILE"
python3 - "$LIST_FILE" "$WORKOUT_ID" <<'PY'
import json
import sys
from pathlib import Path

data = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
workout_id = sys.argv[2]
items = data.get("items", [])
if not any(item.get("id") == workout_id for item in items):
    raise SystemExit("ERRO: treino criado não apareceu na leitura por API.")
print("OK: treino apareceu na leitura por API.")
PY

SQL="
WITH tenant AS (
  SELECT id FROM fitcore_tenants WHERE slug = 'demo' LIMIT 1
), scope AS (
  SELECT set_config('app.tenant_id', (SELECT id::text FROM tenant), true)
)
SELECT jsonb_build_object(
  'workout_id', '$WORKOUT_ID',
  'review_id', '$REVIEW_ID',
  'checkin_id', '$CHECKIN_ID',
  'workouts', (SELECT count(*) FROM fitcore_workouts, scope WHERE tenant_id = (SELECT id FROM tenant) AND source_mvp_id = '$WORKOUT_ID'),
  'reviews', (SELECT count(*) FROM fitcore_professor_reviews, scope WHERE tenant_id = (SELECT id FROM tenant) AND source_mvp_id = '$REVIEW_ID'),
  'executions', (SELECT count(*) FROM fitcore_workout_executions, scope WHERE tenant_id = (SELECT id FROM tenant) AND source_mvp_id = '$CHECKIN_ID'),
  'audit_events', (SELECT count(*) FROM fitcore_audit_events, scope WHERE tenant_id = (SELECT id FROM tenant) AND source_mvp_id IN ('$WORKOUT_ID', '$REVIEW_ID', '$CHECKIN_ID'))
)::text;
"

psql "$DB_URL" -X -A -t -q -v ON_ERROR_STOP=1 -c "$SQL" > "$DB_FILE"
python3 - "$DB_FILE" <<'PY'
import json
import sys
from pathlib import Path

raw = Path(sys.argv[1]).read_text(encoding="utf-8").strip().splitlines()[-1]
data = json.loads(raw)
missing = [key for key in ("workouts", "reviews", "executions") if int(data.get(key, 0)) < 1]
if missing:
    raise SystemExit(f"ERRO: registros não encontrados no PostgreSQL: {', '.join(missing)}")
if int(data.get("audit_events", 0)) < 1:
    raise SystemExit("ERRO: auditoria LGPD não foi persistida no PostgreSQL.")
print(json.dumps(data, ensure_ascii=False, indent=2))
PY

cat > "$SMOKE_DIR/latest-smoke.json" <<JSON
{
  "ok": true,
  "mvp": "MVP-12 Smoke real PostgreSQL",
  "smoke_id": "$SMOKE_ID",
  "api_base": "$API_BASE",
  "workout_id": "$WORKOUT_ID",
  "review_id": "$REVIEW_ID",
  "checkin_id": "$CHECKIN_ID",
  "active_store": "PostgresStore",
  "validated_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "artifacts_dir": "$SMOKE_DIR"
}
JSON

echo
cat "$SMOKE_DIR/latest-smoke.json"
echo
echo "MVP-12 OK: escrita/leitura real no PostgreSQL validada via API + psql."
