#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

required_files=(
  "services/api/persistence/adapter-contract.mjs"
  "apps/site-static/mvp-08.html"
  "apps/site-static/mvp-08.css"
  "apps/site-static/mvp-08.js"
  "docs/17-MVP-08-PERSISTENCE-ADAPTER.md"
)

echo "MVP-08 — verificando arquivos do adapter de persistência"

for file in "${required_files[@]}"; do
  if [[ ! -f "$file" ]]; then
    echo "ERRO: arquivo obrigatório ausente: $file" >&2
    exit 1
  fi
  echo "OK: $file"
done

node --check services/api/persistence/adapter-contract.mjs
node --check apps/site-static/mvp-08.js

grep -q "PersistenceAdapter" services/api/persistence/adapter-contract.mjs
grep -q "JsonFileStore" services/api/persistence/adapter-contract.mjs
grep -q "PostgresStore" services/api/persistence/adapter-contract.mjs
grep -q "FITCORE_DATABASE_URL" docs/17-MVP-08-PERSISTENCE-ADAPTER.md

echo "MVP-08 verificado: contrato do adapter pronto, fallback preservado e PostgresStore preparado."
