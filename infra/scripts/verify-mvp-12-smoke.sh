#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LATEST="$ROOT_DIR/storage/mvp-12/latest-smoke.json"

cd "$ROOT_DIR"

echo "MVP-12 — verificando smoke real PostgreSQL"

if ! curl -fsS https://fitcore.marcaia.app/api/mvp-10/postgres-store | grep -q '"active_store": "PostgresStore"'; then
  echo "ERRO: endpoint público não confirma PostgresStore ativo." >&2
  exit 1
fi

echo "OK: endpoint público confirma PostgresStore."

if ! docker ps --format '{{.Names}} {{.Status}}' | grep -q '^fitcore_postgres .*healthy'; then
  echo "ERRO: fitcore_postgres não está healthy." >&2
  docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' | grep -E 'fitcore_postgres|NAMES' || true
  exit 1
fi

echo "OK: fitcore_postgres healthy."

systemctl is-active --quiet fitcore-api

echo "OK: fitcore-api ativa."

bash infra/scripts/smoke-mvp-12-postgres-write-read.sh

if [[ ! -f "$LATEST" ]]; then
  echo "ERRO: smoke não gerou $LATEST" >&2
  exit 1
fi

if ! grep -q '"ok": true' "$LATEST"; then
  echo "ERRO: latest-smoke.json não confirma ok=true" >&2
  cat "$LATEST" >&2
  exit 1
fi

echo "MVP-12 verificado: smoke real de escrita/leitura no PostgreSQL concluído."
