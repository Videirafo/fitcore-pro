#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
source "$ROOT/infra/scripts/lib/require-safe-test-target.sh"

TARGET="${FITCORE_PUBLIC_URL:-}"
fitcore_require_safe_test_target "$TARGET"

SCRIPT="${1:-}"
[[ -n "$SCRIPT" ]] || { echo "ERRO: informe o script de verificação." >&2; exit 64; }
shift || true

cd "$ROOT"
exec bash "$SCRIPT" "$@"
