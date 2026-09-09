#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SERVER="$ROOT/services/api/server.mjs"
GLUE="$ROOT/services/api/persistence/server-adapter-glue.mjs"

if [ ! -f "$SERVER" ]; then
  echo "ERRO: server.mjs não encontrado em $SERVER" >&2
  exit 1
fi

if [ ! -f "$GLUE" ]; then
  echo "ERRO: server-adapter-glue.mjs não encontrado em $GLUE" >&2
  exit 1
fi

python3 - "$SERVER" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
text = path.read_text(encoding="utf-8")
original = text

import_line = 'import { createServerPersistenceAdapter, createServerPersistenceHealth } from "./persistence/server-adapter-glue.mjs";'
if import_line not in text:
    anchor = 'import { randomUUID } from "node:crypto";\n'
    if anchor not in text:
        raise SystemExit("ERRO: ponto de import do MVP-09 não encontrado.")
    text = text.replace(anchor, anchor + import_line + "\n", 1)

adapter_block = '''
const persistenceAdapter = createServerPersistenceAdapter({
  env: process.env,
  paths: {
    studentsAndWorkouts: mvp01StorePath,
    checkins: mvp02CheckinStorePath,
    professorReviews: mvp03ReviewStorePath,
  },
  readJsonArray,
  writeJsonArray,
});
'''
if "const persistenceAdapter = createServerPersistenceAdapter" not in text:
    anchor = 'const wgerInternalUrl = process.env.FITCORE_WGER_INTERNAL_URL || "http://127.0.0.1:8088";\n'
    if anchor not in text:
        raise SystemExit("ERRO: ponto de criação do adapter não encontrado.")
    text = text.replace(anchor, anchor + adapter_block, 1)

old_store_block = '''function readMvpRecords() {
  return readJsonArray(mvp01StorePath);
}

function writeMvpRecords(records) {
  writeJsonArray(mvp01StorePath, records);
}

function readCheckins() {
  return readJsonArray(mvp02CheckinStorePath);
}

function writeCheckins(records) {
  writeJsonArray(mvp02CheckinStorePath, records);
}

function readProfessorReviews() {
  return readJsonArray(mvp03ReviewStorePath);
}

function writeProfessorReviews(records) {
  writeJsonArray(mvp03ReviewStorePath, records);
}
'''
new_store_block = '''function readMvpRecords() {
  return persistenceAdapter.readArray("studentsAndWorkouts");
}

function writeMvpRecords(records) {
  persistenceAdapter.writeArray("studentsAndWorkouts", records);
}

function readCheckins() {
  return persistenceAdapter.readArray("checkins");
}

function writeCheckins(records) {
  persistenceAdapter.writeArray("checkins", records);
}

function readProfessorReviews() {
  return persistenceAdapter.readArray("professorReviews");
}

function writeProfessorReviews(records) {
  persistenceAdapter.writeArray("professorReviews", records);
}
'''
if old_store_block in text:
    text = text.replace(old_store_block, new_store_block, 1)
elif 'persistenceAdapter.readArray("studentsAndWorkouts")' not in text:
    raise SystemExit("ERRO: bloco de store local não encontrado para troca pelo adapter.")

if "const persistence = createServerPersistenceHealth(persistenceAdapter);" not in text:
    anchor = '      const catalogExists = existsSync(catalogPath);\n      const checkins = readCheckins();\n'
    if anchor not in text:
        raise SystemExit("ERRO: ponto de health do MVP-09 não encontrado.")
    text = text.replace(anchor, '      const persistence = createServerPersistenceHealth(persistenceAdapter);\n' + anchor, 1)

if 'mvp_09: {' not in text:
    anchor = '        api: "api-propria",\n        catalogo_existe: catalogExists,\n'
    replacement = '''        api: "api-propria",
        persistence,
        mvp_09: {
          persistence_adapter: true,
          active_store: persistence.active_store,
          fallback_seguro: persistence.fallback_seguro,
        },
        catalogo_existe: catalogExists,
'''
    if anchor not in text:
        raise SystemExit("ERRO: ponto para expor adapter no health não encontrado.")
    text = text.replace(anchor, replacement, 1)

route_block = '''    if (url.pathname === "/api/mvp-09/persistence") {
      if (req.method !== "GET") return sendMethodNotAllowed(res);
      return sendJson(res, 200, createServerPersistenceHealth(persistenceAdapter));
    }

'''
if '/api/mvp-09/persistence' not in text:
    anchor = '    if (url.pathname === "/api/exercises") {\n'
    if anchor not in text:
        raise SystemExit("ERRO: ponto para rota MVP-09 não encontrado.")
    text = text.replace(anchor, route_block + anchor, 1)

if text != original:
    path.write_text(text, encoding="utf-8")
    print("MVP-09 aplicado em services/api/server.mjs")
else:
    print("MVP-09 já estava aplicado em services/api/server.mjs")
PY

node --check "$GLUE"
node --check "$SERVER"

echo "MVP-09 aplicado: server.mjs conectado ao PersistenceAdapter com JsonFileStore como fallback."
