#!/usr/bin/env bash

# ============================================================
# FITCORE PRO - INSTALL API SERVICE
# Instala a API propria do FitCore como systemd service local.
# Porta padrao: 127.0.0.1:8091
# ============================================================

set -euo pipefail

ROOT="/opt/fitcore-pro"
SERVICE_FILE="/etc/systemd/system/fitcore-api.service"
NODE_BIN="$(command -v node || true)"

if [ "$(id -u)" -ne 0 ]; then
  echo "ERRO: rode como root."
  exit 1
fi

if [ -z "$NODE_BIN" ]; then
  echo "ERRO: node nao encontrado no PATH."
  exit 1
fi

if [ ! -f "$ROOT/services/api/server.mjs" ]; then
  echo "ERRO: $ROOT/services/api/server.mjs nao encontrado."
  exit 1
fi

if [ ! -f "$ROOT/storage/exercises-dataset/exercises.normalized.json" ]; then
  echo "ERRO: catalogo normalizado nao encontrado. Rode:"
  echo "  cd $ROOT"
  echo "  npm run exercises:sync"
  echo "  npm run exercises:normalize"
  exit 1
fi

cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=FitCore Pro API
After=network.target

[Service]
Type=simple
WorkingDirectory=$ROOT
ExecStart=$NODE_BIN $ROOT/services/api/server.mjs
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=FITCORE_API_HOST=127.0.0.1
Environment=FITCORE_API_PORT=8091
Environment=FITCORE_WGER_INTERNAL_URL=http://127.0.0.1:8088

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now fitcore-api.service
sleep 2
systemctl --no-pager --full status fitcore-api.service || true

echo ""
echo "Teste local da API:"
curl -sS http://127.0.0.1:8091/api/health || true
echo ""
