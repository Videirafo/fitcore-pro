#!/usr/bin/env bash
set -euo pipefail
cd /opt/fitcore-pro
rm -f /etc/systemd/system/fitcore-api.service.d/30-fitcore-credential-login.conf
systemctl daemon-reload
systemctl restart fitcore-api
systemctl status --no-pager fitcore-api

echo "MVP-19 rollback: login por credencial desativado. MVP-15/MVP-18 permanecem intactos."
