#!/usr/bin/env bash
set -euo pipefail
cd /opt/fitcore-pro

OVERRIDE=/etc/systemd/system/fitcore-api.service.d/60-fitcore-mvp46-mobile-release.conf
rm -f "$OVERRIDE"
systemctl daemon-reload
systemctl restart fitcore-api
systemctl is-active --quiet fitcore-api

echo "MVP-46 rollback operacional: feature flag removida; tabela e séries preservadas."
echo "O rollback SQL destrutivo existe somente para gates descartáveis e não é executado em produção."
