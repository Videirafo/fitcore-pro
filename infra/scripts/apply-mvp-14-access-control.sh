#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SERVER="$ROOT/services/api/server.mjs"
SECURITY="$ROOT/services/api/security/access-context.mjs"

cd "$ROOT"

if [[ ! -f "$SERVER" ]]; then
  echo "ERRO: server.mjs não encontrado." >&2
  exit 1
fi

if [[ ! -f "$SECURITY" ]]; then
  echo "ERRO: access-context.mjs não encontrado." >&2
  exit 1
fi

python3 - <<'PY'
from pathlib import Path

path = Path("services/api/server.mjs")
text = path.read_text(encoding="utf-8")
original = text

import_line = 'import { createAccessContext, createAccessHealth } from "./security/access-context.mjs";'
if import_line not in text:
    anchor = 'import { createServerPersistenceAdapter, createServerPersistenceHealth } from "./persistence/server-adapter-glue.mjs";\n'
    if anchor not in text:
        raise SystemExit("ERRO: ponto de import do MVP-14 não encontrado.")
    text = text.replace(anchor, anchor + import_line + "\n", 1)

if "const accessContext = createAccessContext(req, process.env);" not in text:
    anchor = '    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);\n'
    if anchor not in text:
        raise SystemExit("ERRO: ponto de criação de accessContext não encontrado.")
    text = text.replace(anchor, anchor + "    const accessContext = createAccessContext(req, process.env);\n", 1)

if "const access = createAccessHealth(accessContext);" not in text:
    anchor = '      const persistence = createServerPersistenceHealth(persistenceAdapter);\n'
    if anchor not in text:
        raise SystemExit("ERRO: ponto de health do MVP-14 não encontrado.")
    text = text.replace(anchor, anchor + "      const access = createAccessHealth(accessContext);\n", 1)

if '        access,' not in text:
    anchor = '        persistence,\n'
    if anchor not in text:
        raise SystemExit("ERRO: ponto para expor access no /api/health não encontrado.")
    text = text.replace(anchor, anchor + "        access,\n", 1)

if 'mvp_14: {' not in text:
    anchor = '        catalogo_existe: catalogExists,\n'
    insert = '''        mvp_14: {
          auth_rbac_foundation: true,
          tenant_slug: access.tenant_slug,
          actor_role: access.actor_role,
          enforcement: access.enforcement,
          login_real: false,
        },
'''
    if anchor not in text:
        raise SystemExit("ERRO: ponto para expor mvp_14 no health não encontrado.")
    text = text.replace(anchor, insert + anchor, 1)

route = '''    if (url.pathname === "/api/mvp-14/access-context") {
      if (req.method !== "GET") return sendMethodNotAllowed(res);
      return sendJson(res, 200, createAccessHealth(accessContext));
    }

'''
if '/api/mvp-14/access-context' not in text:
    anchor = '    if (url.pathname === "/api/exercises") {\n'
    if anchor not in text:
        raise SystemExit("ERRO: ponto para endpoint MVP-14 não encontrado.")
    text = text.replace(anchor, route + anchor, 1)

if text != original:
    path.write_text(text, encoding="utf-8")
    print("MVP-14 aplicado em services/api/server.mjs")
else:
    print("MVP-14 já estava aplicado em services/api/server.mjs")
PY

node --check services/api/security/access-context.mjs
node --check services/api/server.mjs

echo "MVP-14 aplicado: access context e RBAC foundation expostos no servidor."
