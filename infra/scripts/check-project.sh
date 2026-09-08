#!/usr/bin/env bash
set -e

ROOT="/opt/fitcore-pro"

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

for dir in "${DIRS[@]}"; do
  if [ -d "$ROOT/$dir" ]; then
    echo "OK: $dir"
  else
    echo "FALTANDO: $dir"
  fi
done

echo ""
echo "Check finalizado."
