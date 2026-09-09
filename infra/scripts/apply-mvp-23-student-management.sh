#!/usr/bin/env bash
set -euo pipefail
cd /opt/fitcore-pro

resolve_db_url() {
  if [ -n "${FITCORE_DATABASE_URL:-}" ]; then echo "$FITCORE_DATABASE_URL"; return 0; fi
  if [ -f storage/secrets/fitcore-postgres.env ]; then
    set -a
    # shellcheck disable=SC1091
    . storage/secrets/fitcore-postgres.env
    set +a
    if [ -n "${POSTGRES_DB:-}" ] && [ -n "${POSTGRES_USER:-}" ] && [ -n "${POSTGRES_PASSWORD:-}" ]; then
      echo "postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:55435/${POSTGRES_DB}?sslmode=disable"
      return 0
    fi
  fi
  return 1
}

FITCORE_DATABASE_URL=$(resolve_db_url) || { echo "ERRO: FITCORE_DATABASE_URL não resolvido." >&2; exit 1; }
export FITCORE_DATABASE_URL

psql "$FITCORE_DATABASE_URL" -v ON_ERROR_STOP=1 -f infra/sql/009-mvp-23-student-management.sql
mkdir -p /etc/systemd/system/fitcore-api.service.d
cat > /etc/systemd/system/fitcore-api.service.d/50-fitcore-students.conf <<'EOF'
[Service]
Environment="FITCORE_STUDENT_MANAGEMENT_ENABLED=true"
EOF

node --check services/api/security/student-management.mjs
node --check services/api/security/signed-session.mjs
node --check services/api/security/navigation-rbac.mjs
node --check services/api/server.mjs
node --check apps/site-static/mvp-23.js
node tools/check-front-assets.mjs
node tools/check-next-app.mjs

systemctl daemon-reload
systemctl restart fitcore-api
systemctl status --no-pager fitcore-api

echo "MVP-23 aplicado: cadastro operacional de aluno real ativo."
