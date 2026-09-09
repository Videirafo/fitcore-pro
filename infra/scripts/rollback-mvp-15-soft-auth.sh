#!/usr/bin/env bash
set -euo pipefail
DROPIN_FILE="/etc/systemd/system/fitcore-api.service.d/20-fitcore-session.conf"
if [ "$(id -u)" -ne 0 ]; then
  echo "ERRO: rode como root para alterar systemd." >&2
  exit 1
fi
rm -f "$DROPIN_FILE"
systemctl daemon-reload
systemctl restart fitcore-api
sleep 2
systemctl is-active --quiet fitcore-api
echo "Rollback MVP-15 concluído: API voltou ao modo soft de headers/defaults."
