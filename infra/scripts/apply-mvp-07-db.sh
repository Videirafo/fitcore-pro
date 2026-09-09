#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SQL_FILE="$ROOT_DIR/infra/sql/001-mvp-07-core.sql"
STATUS_DIR="$ROOT_DIR/storage/mvp-07"
STATUS_FILE="$STATUS_DIR/db-status.json"

mkdir -p "$STATUS_DIR"

DB_URL="${FITCORE_DATABASE_URL:-${DATABASE_URL:-${SUPABASE_DB_URL:-${POSTGRES_URL:-}}}}"
NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

if [[ ! -f "$SQL_FILE" ]]; then
  echo "ERRO: migration não encontrada: $SQL_FILE" >&2
  exit 1
fi

if [[ -z "$DB_URL" ]]; then
  cat > "$STATUS_FILE" <<JSON
{
  "ok": true,
  "modo": "fallback_json_local",
  "banco": "nao_configurado",
  "mensagem": "FITCORE_DATABASE_URL não definido. MVP-07 mantém API em JSON local até o banco ser configurado.",
  "migration": "infra/sql/001-mvp-07-core.sql",
  "atualizado_em": "$NOW"
}
JSON
  echo "MVP-07 em fallback seguro: banco não configurado."
  echo "Arquivo de status: $STATUS_FILE"
  echo "Para aplicar no PostgreSQL, defina FITCORE_DATABASE_URL e rode novamente."
  exit 0
fi

if ! command -v psql >/dev/null 2>&1; then
  cat > "$STATUS_FILE" <<JSON
{
  "ok": false,
  "modo": "fallback_json_local",
  "banco": "psql_indisponivel",
  "mensagem": "psql não encontrado no servidor. Instale o cliente PostgreSQL antes de aplicar a migration.",
  "migration": "infra/sql/001-mvp-07-core.sql",
  "atualizado_em": "$NOW"
}
JSON
  echo "ERRO: psql não encontrado." >&2
  echo "A API continua em fallback JSON local." >&2
  exit 1
fi

psql "$DB_URL" -v ON_ERROR_STOP=1 -f "$SQL_FILE"

cat > "$STATUS_FILE" <<JSON
{
  "ok": true,
  "modo": "postgres",
  "banco": "configurado",
  "mensagem": "MVP-07 aplicado com schema mínimo, tenant_id, user_role e auditoria LGPD.",
  "migration": "infra/sql/001-mvp-07-core.sql",
  "atualizado_em": "$NOW"
}
JSON

echo "MVP-07 aplicado no PostgreSQL."
echo "Arquivo de status: $STATUS_FILE"