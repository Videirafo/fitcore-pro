#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

echo "Verificando FitCore Pro em $ROOT"
echo ""

DIRS=(
  "apps/admin"
  "apps/site"
  "apps/site-static"
  "apps/mobile"
  "services/api"
  "services/orchestrator"
  "packages/sdk-wger"
  "packages/validators"
  "packages/config"
  "packages/ui"
  "content/workout-series"
  "assets/images"
  "infra/scripts"
  "infra/docker"
  "infra/nginx"
  "infra/monitoring"
  "infra/backups"
  "docs"
  "legal"
  "upstream"
)

missing=0
for dir in "${DIRS[@]}"; do
  if [ -d "$ROOT/$dir" ]; then
    echo "OK: $dir"
  else
    echo "FALTANDO: $dir" >&2
    missing=1
  fi
done

if [ "$missing" -ne 0 ]; then
  echo "" >&2
  echo "ERRO: estrutura obrigatória incompleta no checkout atual." >&2
  exit 1
fi

echo ""
echo "Check finalizado no checkout atual."
