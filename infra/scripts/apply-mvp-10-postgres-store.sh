#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SQL_FILE="$ROOT_DIR/infra/sql/002-mvp-10-postgres-store.sql"
STATUS_DIR="$ROOT_DIR/storage/mvp-10"
STATUS_FILE="$STATUS_DIR/postgres-store-status.json"
SERVER_FILE="$ROOT_DIR/services/api/server.mjs"
NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
DB_URL="${FITCORE_DATABASE_URL:-${DATABASE_URL:-}}"

mkdir -p "$STATUS_DIR"

if [[ ! -f "$SQL_FILE" ]]; then
  echo "ERRO: migration não encontrada: $SQL_FILE" >&2
  exit 1
fi

if [[ ! -f "$SERVER_FILE" ]]; then
  echo "ERRO: server.mjs não encontrado: $SERVER_FILE" >&2
  exit 1
fi

python3 - <<'PY'
from pathlib import Path

path = Path("services/api/server.mjs")
text = path.read_text()

if 'mvp_10:' not in text:
    marker = '''        catalogo_existe: catalogExists,'''
    insert = '''        mvp_10: {
          postgres_store_controlado: true,
          active_store: persistence.active_store,
          database_configured: persistence.database_configured,
          postgres_ready: Boolean(persistence.postgres?.ready),
          activation_requested: Boolean(persistence.postgres?.activation_requested),
          fallback_seguro: persistence.fallback_seguro,
        },
'''
    if marker not in text:
        raise SystemExit("Não foi possível localizar o ponto de inserção do mvp_10 no health.")
    text = text.replace(marker, insert + marker, 1)

if '/api/mvp-10/postgres-store' not in text:
    marker = '''    if (url.pathname === "/api/exercises") {'''
    route = '''    if (url.pathname === "/api/mvp-10/postgres-store") {
      if (req.method !== "GET") return sendMethodNotAllowed(res);
      const persistence = createServerPersistenceHealth(persistenceAdapter);
      return sendJson(res, 200, {
        ok: true,
        mvp: "MVP-10 PostgresStore controlado",
        postgres_store_controlado: true,
        adapter: persistence.adapter,
        selected_store: persistence.selected_store,
        active_store: persistence.active_store,
        requested_store: persistence.requested_store,
        database_configured: persistence.database_configured,
        fallback_seguro: persistence.fallback_seguro,
        postgres: persistence.postgres,
        resources: persistence.resources,
        stores: persistence.stores,
        policy: persistence.policy,
        reason: persistence.reason,
      });
    }

'''
    if marker not in text:
        raise SystemExit("Não foi possível localizar o ponto de inserção do endpoint MVP-10.")
    text = text.replace(marker, route + marker, 1)

path.write_text(text)
PY

echo "MVP-10: endpoint /api/mvp-10/postgres-store preparado em server.mjs."

if [[ -z "$DB_URL" ]]; then
  cat > "$STATUS_FILE" <<JSON
{
  "ok": true,
  "mvp": "MVP-10 PostgresStore controlado",
  "modo": "fallback_json_local",
  "banco": "nao_configurado",
  "postgres_store": "preparado_nao_ativado",
  "mensagem": "FITCORE_DATABASE_URL não definido. O servidor permanece em JsonFileStore.",
  "ativacao": "defina FITCORE_DATABASE_URL e FITCORE_PERSISTENCE_STORE=postgres somente depois de aplicar a migration",
  "migration": "infra/sql/002-mvp-10-postgres-store.sql",
  "atualizado_em": "$NOW"
}
JSON
  echo "MVP-10 em fallback seguro: banco não configurado."
  echo "Arquivo de status: $STATUS_FILE"
  echo "Para ativar PostgreSQL: exporte FITCORE_DATABASE_URL, rode este script novamente, depois defina FITCORE_PERSISTENCE_STORE=postgres no serviço."
else
  if ! command -v psql >/dev/null 2>&1; then
    cat > "$STATUS_FILE" <<JSON
{
  "ok": false,
  "mvp": "MVP-10 PostgresStore controlado",
  "modo": "fallback_json_local",
  "banco": "psql_indisponivel",
  "postgres_store": "nao_ativado",
  "mensagem": "psql não encontrado no servidor. Instale postgresql-client antes de aplicar a migration.",
  "migration": "infra/sql/002-mvp-10-postgres-store.sql",
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
  "mvp": "MVP-10 PostgresStore controlado",
  "modo": "postgres_preparado",
  "banco": "migration_aplicada",
  "postgres_store": "pronto_para_ativacao_controlada",
  "mensagem": "Migration MVP-10 aplicada. Ative com FITCORE_PERSISTENCE_STORE=postgres somente após verificar o endpoint.",
  "migration": "infra/sql/002-mvp-10-postgres-store.sql",
  "rollback": "remover FITCORE_PERSISTENCE_STORE=postgres volta para JsonFileStore",
  "atualizado_em": "$NOW"
}
JSON
  echo "MVP-10 aplicado no PostgreSQL."
  echo "Arquivo de status: $STATUS_FILE"
fi

node --check services/api/persistence/postgres-store.mjs
node --check services/api/persistence/server-adapter-glue.mjs
node --check services/api/server.mjs

echo "MVP-10 aplicado: PostgresStore preparado com fallback JSON preservado."
