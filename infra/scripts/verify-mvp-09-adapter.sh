#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SERVER="$ROOT/services/api/server.mjs"
GLUE="$ROOT/services/api/persistence/server-adapter-glue.mjs"

echo "MVP-09 — verificando server conectado ao PersistenceAdapter"

require_file() {
  local file="$1"
  if [ ! -f "$file" ]; then
    echo "ERRO: arquivo ausente: $file" >&2
    exit 1
  fi
  echo "OK: ${file#$ROOT/}"
}

require_pattern() {
  local pattern="$1"
  local file="$2"
  local label="$3"
  if ! grep -q "$pattern" "$file"; then
    echo "ERRO: padrão ausente em ${file#$ROOT/}: $label" >&2
    exit 1
  fi
  echo "OK: $label"
}

require_file "$GLUE"
require_file "$SERVER"

require_pattern "createServerPersistenceAdapter" "$SERVER" "server cria PersistenceAdapter"
require_pattern "persistenceAdapter.readArray" "$SERVER" "leituras passam pelo adapter"
require_pattern "persistenceAdapter.writeArray" "$SERVER" "gravações passam pelo adapter"
require_pattern "/api/mvp-09/persistence" "$SERVER" "endpoint público de diagnóstico MVP-09"
require_pattern "createServerPersistenceHealth" "$SERVER" "health expõe store ativo"
require_pattern "JsonFileStore" "$GLUE" "fallback JsonFileStore preservado"
require_pattern "PostgresStore" "$ROOT/services/api/persistence/adapter-contract.mjs" "PostgresStore continua preparado"

node --check "$GLUE"
node --check "$SERVER"

if command -v curl >/dev/null 2>&1; then
  if curl -fsS http://127.0.0.1:8091/api/mvp-09/persistence >/tmp/fitcore-mvp09-persistence.json 2>/dev/null; then
    grep -q '"active_store"' /tmp/fitcore-mvp09-persistence.json
    grep -q '"JsonFileStore"' /tmp/fitcore-mvp09-persistence.json
    echo "OK: API local respondeu /api/mvp-09/persistence"
  else
    echo "AVISO: API local não respondeu em 127.0.0.1:8091; rode systemctl restart fitcore-api depois do apply."
  fi
fi

echo "MVP-09 verificado: server.mjs conectado ao PersistenceAdapter com fallback JSON preservado."
