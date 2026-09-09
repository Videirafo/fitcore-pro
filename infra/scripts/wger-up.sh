#!/usr/bin/env bash

# ============================================================
# FITCORE PRO - WGER UP
# Sobe o wger local com segurança, sem apagar volumes.
# ============================================================

set -euo pipefail

WGER_DIR="/opt/fitcore-pro/upstream/wger-docker"

if [ ! -d "$WGER_DIR" ]; then
  echo "ERRO: wger-docker não encontrado em $WGER_DIR"
  echo "Clone primeiro com:"
  echo "cd /opt/fitcore-pro/upstream && git clone https://github.com/wger-project/docker.git wger-docker"
  exit 1
fi

cd "$WGER_DIR"

echo "Subindo wger em $WGER_DIR..."
docker compose up -d

echo "Aguardando estabilização..."
sleep 20

echo "Estado dos containers:"
docker compose ps

echo "Teste HTTP local:"
curl -I http://127.0.0.1:8088 || true
