#!/usr/bin/env bash

# ============================================================
# FITCORE PRO - LOCK WGER PUBLIC PORT
# Restringe o wger para responder apenas em localhost.
# Publico deve acessar via https://fitcore.marcaia.app.
# ============================================================

set -euo pipefail

WGER_DIR="/opt/fitcore-pro/upstream/wger-docker"
COMPOSE_FILE="$WGER_DIR/docker-compose.yml"

if [ "$(id -u)" -ne 0 ]; then
  echo "ERRO: rode como root."
  exit 1
fi

if [ ! -f "$COMPOSE_FILE" ]; then
  echo "ERRO: docker-compose.yml nao encontrado em $COMPOSE_FILE"
  exit 1
fi

cd "$WGER_DIR"

BACKUP="docker-compose.yml.bak.lock-port.$(date +%Y%m%d-%H%M%S)"
cp docker-compose.yml "$BACKUP"

python3 - <<'PY'
from pathlib import Path
import re

p = Path("docker-compose.yml")
s = p.read_text()

# Troca apenas mapeamentos 8088:80 ainda públicos.
patterns = [
    (r'"8088:80"', '"127.0.0.1:8088:80"'),
    (r"'8088:80'", "'127.0.0.1:8088:80'"),
    (r'(?m)(\s*-\s*)8088:80\s*$', r'\g<1>127.0.0.1:8088:80'),
]

out = s
for pattern, replacement in patterns:
    out = re.sub(pattern, replacement, out)

if out == s and "127.0.0.1:8088:80" not in s:
    raise SystemExit("ERRO: nao encontrei mapeamento 8088:80 para ajustar.")

p.write_text(out)
PY

echo "Compose ajustado. Backup: $BACKUP"
echo "Mapeamento atual da porta 8088:"
grep -n "8088.*80\|127.0.0.1:8088" docker-compose.yml || true

docker compose down
docker compose up -d
sleep 30

docker compose ps

echo ""
echo "Teste local esperado: HTTP 302 para /en/"
curl -I http://127.0.0.1:8088 || true

echo ""
echo "Teste publico esperado: HTTP 301/302 via Cloudflare/Nginx"
curl -I https://fitcore.marcaia.app || true

echo ""
echo "Socket esperado: 127.0.0.1:8088, nao 0.0.0.0:8088"
ss -ltnp | grep 8088 || true

echo ""
echo "Opcional: remover regra UFW publica se existir: ufw --force delete allow 8088/tcp"
