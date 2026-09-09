#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SQL="$ROOT/infra/sql/003-mvp-15-signed-sessions.sql"
ENV_FILE="$ROOT/storage/secrets/fitcore-postgres.env"
SECRET_FILE="$ROOT/storage/secrets/fitcore-session-secret"
DROPIN_DIR="/etc/systemd/system/fitcore-api.service.d"
DROPIN_FILE="$DROPIN_DIR/20-fitcore-session.conf"
DB_HOST="127.0.0.1"
DB_PORT="55435"

cd "$ROOT"

if [ "$(id -u)" -ne 0 ]; then
  echo "ERRO: rode como root para alterar systemd." >&2
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "ERRO: segredo Postgres ausente: $ENV_FILE" >&2
  exit 1
fi

set -a
. "$ENV_FILE"
set +a

DB_URL="${FITCORE_DATABASE_URL:-${DATABASE_URL:-}}"
if [[ -z "$DB_URL" && -n "${POSTGRES_USER:-}" && -n "${POSTGRES_PASSWORD:-}" && -n "${POSTGRES_DB:-}" ]]; then
  DB_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${DB_HOST}:${DB_PORT}/${POSTGRES_DB}?sslmode=disable"
fi

if [[ -z "$DB_URL" ]]; then
  echo "ERRO: DB_URL não resolvida." >&2
  exit 1
fi

psql "$DB_URL" -v ON_ERROR_STOP=1 -f "$SQL" >/dev/null

mkdir -p "$(dirname "$SECRET_FILE")" "$DROPIN_DIR"
chmod 700 "$(dirname "$SECRET_FILE")"
if [ ! -f "$SECRET_FILE" ]; then
  openssl rand -hex 48 > "$SECRET_FILE"
  chmod 600 "$SECRET_FILE"
  echo "Segredo de sessão criado: $SECRET_FILE"
else
  echo "Segredo de sessão preservado: $SECRET_FILE"
fi

python3 - <<'PY'
from pathlib import Path
path = Path("services/api/server.mjs")
text = path.read_text(encoding="utf-8")
if 'createSignedSessionManager' not in text:
    text = text.replace('import { createAccessContext, createAccessHealth } from "./security/access-context.mjs";\n', 'import { createAccessContext, createAccessHealth } from "./security/access-context.mjs";\nimport { createSignedSessionManager } from "./security/signed-session.mjs";\n')
if 'const sessionManager = createSignedSessionManager(process.env);' not in text:
    text = text.replace('});\n\nlet catalogCache = null;', '});\n\nconst sessionManager = createSignedSessionManager(process.env);\n\nlet catalogCache = null;', 1)
text = text.replace('function sendJson(res, statusCode, payload) {\n  const body = JSON.stringify(payload, null, 2);\n  res.writeHead(statusCode, {\n    "content-type": "application/json; charset=utf-8",\n    "cache-control": "no-store",\n    "x-fitcore-api": "owned-api",\n  });', 'function sendJson(res, statusCode, payload, extraHeaders = {}) {\n  const body = JSON.stringify(payload, null, 2);\n  res.writeHead(statusCode, {\n    "content-type": "application/json; charset=utf-8",\n    "cache-control": "no-store",\n    "x-fitcore-api": "owned-api",\n    ...extraHeaders,\n  });')
text = text.replace('    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);\n    const accessContext = createAccessContext(req, process.env);\n\n    if (url.pathname === "/api/health") {', '    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);\n    const softAccessContext = createAccessContext(req, process.env);\n    const signedAccessContext = sessionManager.resolveAccessContext(req);\n    const accessContext = signedAccessContext || softAccessContext;\n    const routeDecision = sessionManager.authorizeRoute(accessContext, url.pathname, req.method);\n    if (!routeDecision.allowed) return sendJson(res, routeDecision.statusCode, routeDecision.response);\n\n    if (url.pathname === "/api/health") {')
if 'mvp_15:' not in text:
    text = text.replace('        catalogo_existe: catalogExists,', '        mvp_15: {\n          signed_session: sessionManager.signedMode,\n          tenant_slug: accessContext.tenant_slug,\n          actor_role: accessContext.actor_role,\n          session_signed: Boolean(accessContext.session_signed),\n          role_from_db: Boolean(accessContext.role_from_db),\n          headers_trusted: Boolean(accessContext.headers_trusted),\n          rollback_soft: "bash infra/scripts/rollback-mvp-15-soft-auth.sh",\n        },\n        catalogo_existe: catalogExists,')
route = '''\n    if (url.pathname === "/api/mvp-15/session") {\n      if (req.method !== "GET") return sendMethodNotAllowed(res);\n      return sendJson(res, 200, sessionManager.publicHealth(req, accessContext));\n    }\n\n    if (url.pathname === "/api/mvp-15/session/login") {\n      if (req.method !== "POST") return sendMethodNotAllowed(res);\n      const input = await readJsonBody(req);\n      const created = sessionManager.createSession(input);\n      return sendJson(res, 201, { ok: true, mvp: "MVP-15 Signed Session RBAC", login: true, session: created.session }, { "set-cookie": created.cookie });\n    }\n\n    if (url.pathname === "/api/mvp-15/session/logout") {\n      if (req.method !== "POST") return sendMethodNotAllowed(res);\n      const result = sessionManager.logout(req);\n      return sendJson(res, 200, { ok: true, mvp: "MVP-15 Signed Session RBAC", logout: true }, { "set-cookie": result.cookie });\n    }\n\n'''
if '/api/mvp-15/session/login' not in text:
    text = text.replace('    if (url.pathname === "/api/exercises") {', route + '    if (url.pathname === "/api/exercises") {', 1)
path.write_text(text, encoding="utf-8")
PY

cat > "$DROPIN_FILE" <<EOF2
[Service]
Environment="FITCORE_AUTH_MODE=signed"
Environment="FITCORE_SESSION_SECRET_FILE=$SECRET_FILE"
Environment="FITCORE_SESSION_COOKIE_NAME=fitcore_session"
Environment="FITCORE_SESSION_COOKIE_SECURE=true"
Environment="FITCORE_SESSION_TTL_SECONDS=28800"
EOF2
chmod 600 "$DROPIN_FILE"

node --check services/api/security/signed-session.mjs
node --check services/api/server.mjs
systemctl daemon-reload
systemctl restart fitcore-api
sleep 3
systemctl is-active --quiet fitcore-api

echo "MVP-15 aplicado: sessão assinada ativa com rollback soft disponível."
