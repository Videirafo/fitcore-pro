#!/usr/bin/env bash
set -euo pipefail
rm -f /etc/systemd/system/fitcore-api.service.d/50-fitcore-workout-prescription.conf
systemctl daemon-reload
systemctl restart fitcore-api
systemctl status --no-pager fitcore-api

echo "Rollback MVP-24 aplicado: feature flag de prescrição removida. As tabelas e dados foram preservados."
