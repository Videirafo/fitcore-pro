#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DB_URL="${FITCORE_DATABASE_URL:-${DATABASE_URL:-}}"
[[ -n "$DB_URL" ]] || { echo "ERRO: FITCORE_DATABASE_URL obrigatório." >&2; exit 2; }
command -v psql >/dev/null || { echo "ERRO: psql obrigatório." >&2; exit 2; }
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f "$ROOT/infra/sql/030-privacy-audit-recovery.sql"
echo "privacy_audit_recovery_migration=PASS"
