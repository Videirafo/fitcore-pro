#!/usr/bin/env bash
set -euo pipefail
cd /opt/fitcore-pro
rm -f /etc/systemd/system/fitcore-api.service.d/40-fitcore-auth-hardening.conf
systemctl daemon-reload
systemctl restart fitcore-api
systemctl status --no-pager fitcore-api
echo "MVP-20 rollback aplicado: hardening rígido removido. Dados e credenciais preservados."
