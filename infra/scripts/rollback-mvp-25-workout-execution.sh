#!/usr/bin/env bash
set -euo pipefail
cd /opt/fitcore-pro
rm -f /etc/systemd/system/fitcore-api.service.d/50-fitcore-workout-execution.conf
systemctl daemon-reload
systemctl restart fitcore-api
systemctl status --no-pager fitcore-api
echo "MVP-25 rollback: flag de execução removida. Tabelas preservadas."
