#!/usr/bin/env bash
set -euo pipefail
cd /opt/fitcore-pro

rm -f /etc/systemd/system/fitcore-api.service.d/50-fitcore-tenant-users.conf
systemctl daemon-reload
systemctl restart fitcore-api
systemctl status --no-pager fitcore-api

echo "Rollback MVP-22 aplicado: gestão específica desligada por ambiente. Dados preservados."
