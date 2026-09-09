#!/usr/bin/env bash
set -euo pipefail

DROPIN_FILE="/etc/systemd/system/fitcore-api.service.d/10-fitcore-persistence.conf"

if [ "$(id -u)" -ne 0 ]; then
  echo "ERRO: rode como root para alterar systemd." >&2
  exit 1
fi

if [ -f "$DROPIN_FILE" ]; then
  rm -f "$DROPIN_FILE"
  echo "Drop-in removido: $DROPIN_FILE"
else
  echo "Drop-in já não existia: $DROPIN_FILE"
fi

systemctl daemon-reload
systemctl restart fitcore-api
sleep 3
systemctl status --no-pager fitcore-api

echo
echo "Estado atual:"
curl -s http://127.0.0.1:8091/api/mvp-10/postgres-store || true

echo
echo "Rollback concluído: JsonFileStore deve voltar a ser o store ativo."
