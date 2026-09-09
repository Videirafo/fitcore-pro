#!/usr/bin/env bash
set -euo pipefail
rm -f /etc/systemd/system/fitcore-api.service.d/50-fitcore-student-evolution.conf
systemctl daemon-reload
systemctl restart fitcore-api
echo "MVP-26 rollback: flag removida; tabelas preservadas."
