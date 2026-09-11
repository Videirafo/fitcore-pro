#!/usr/bin/env bash
set -euo pipefail

fitcore_require_safe_test_target() {
  local target="${1:-}"
  local normalized
  normalized="$(printf '%s' "$target" | tr '[:upper:]' '[:lower:]')"

  if [[ -z "$normalized" ]]; then
    echo "ERRO: FITCORE_PUBLIC_URL de teste não foi definido." >&2
    return 78
  fi

  if [[ "$normalized" == *"fitcore.marcaia.app"* ]]; then
    echo "ERRO: testes mutáveis contra fitcore.marcaia.app são proibidos." >&2
    echo "Use PostgreSQL/runtime descartável e FITCORE_PUBLIC_URL local." >&2
    return 78
  fi

  if [[ "$normalized" != http://127.0.0.1:* && "$normalized" != http://localhost:* && "$normalized" != https://127.0.0.1:* && "$normalized" != https://localhost:* ]]; then
    echo "ERRO: alvo mutável não-local recusado: $target" >&2
    return 78
  fi
}
