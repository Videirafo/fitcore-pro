#!/usr/bin/env bash

# ============================================================
# FITCORE PRO - CONFIGURAR SUBDOMINIO MARCAIA
# Configura Nginx principal da VPS para expor o runtime local
# em fitcore.marcaia.app.
# ============================================================

set -euo pipefail

DOMAIN="fitcore.marcaia.app"
ROOT="/opt/fitcore-pro"
WGER_DIR="$ROOT/upstream/wger-docker"
NGINX_AVAILABLE="/etc/nginx/sites-available/$DOMAIN"
NGINX_ENABLED="/etc/nginx/sites-enabled/$DOMAIN"
SOURCE_CONF="$ROOT/infra/nginx/fitcore.marcaia.app.conf"

if [ "$(id -u)" -ne 0 ]; then
  echo "ERRO: rode como root."
  exit 1
fi

if [ ! -d "$WGER_DIR" ]; then
  echo "ERRO: wger-docker não encontrado em $WGER_DIR"
  exit 1
fi

if [ ! -f "$SOURCE_CONF" ]; then
  echo "ERRO: configuração Nginx não encontrada em $SOURCE_CONF"
  exit 1
fi

cp "$SOURCE_CONF" "$NGINX_AVAILABLE"
ln -sfn "$NGINX_AVAILABLE" "$NGINX_ENABLED"

nginx -t
systemctl reload nginx

cd "$WGER_DIR"

sed -i "s|^SITE_URL=.*|SITE_URL=https://$DOMAIN|" config/prod.env

grep -q '^ALLOWED_HOSTS=' config/prod.env \
  && sed -i "s|^ALLOWED_HOSTS=.*|ALLOWED_HOSTS=$DOMAIN,144.91.99.6,localhost,127.0.0.1|" config/prod.env \
  || echo "ALLOWED_HOSTS=$DOMAIN,144.91.99.6,localhost,127.0.0.1" >> config/prod.env

docker compose down
docker compose up -d
sleep 30
docker compose ps

echo ""
echo "Subdominio configurado no Nginx local: $DOMAIN"
echo "Antes de emitir HTTPS, confirme que o DNS A aponta para 144.91.99.6."
echo "Depois rode: certbot --nginx -d $DOMAIN"
