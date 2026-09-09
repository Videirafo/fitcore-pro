#!/usr/bin/env bash

# ============================================================
# FITCORE PRO - WGER STATUS
# Mostra o estado do wger local e testa a porta pública 8088.
# ============================================================

set -euo pipefail

WGER_DIR="/opt/fitcore-pro/upstream/wger-docker"

if [ ! -d "$WGER_DIR" ]; then
  echo "ERRO: wger-docker não encontrado em $WGER_DIR"
  exit 1
fi

cd "$WGER_DIR"

echo "Containers wger:"
docker compose ps

echo ""
echo "Teste HTTP local:"
curl -I http://127.0.0.1:8088 || true

echo ""
echo "Uso de volumes Docker do wger:"
docker volume ls | grep 'wger-docker' || true
