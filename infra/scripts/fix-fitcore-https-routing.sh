#!/usr/bin/env bash

# ============================================================
# FITCORE PRO - FIX HTTPS ROUTING
# Garante que https://fitcore.marcaia.app caia no runtime FitCore/wger
# em 127.0.0.1:8088, e nao no host principal do MarcaIA.
# ============================================================

set -euo pipefail

DOMAIN="fitcore.marcaia.app"
UPSTREAM="http://127.0.0.1:8088"
CONF="/etc/nginx/sites-available/$DOMAIN"
ENABLED="/etc/nginx/sites-enabled/$DOMAIN"
CERT_DIR="/etc/letsencrypt/live/$DOMAIN"
WGER_DIR="/opt/fitcore-pro/upstream/wger-docker"

if [ "$(id -u)" -ne 0 ]; then
  echo "ERRO: rode como root."
  exit 1
fi

if [ ! -f "$CERT_DIR/fullchain.pem" ] || [ ! -f "$CERT_DIR/privkey.pem" ]; then
  echo "ERRO: certificado nao encontrado em $CERT_DIR. Rode antes: certbot --nginx -d $DOMAIN"
  exit 1
fi

cat > "$CONF" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;

    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name $DOMAIN;

    ssl_certificate $CERT_DIR/fullchain.pem;
    ssl_certificate_key $CERT_DIR/privkey.pem;

    location / {
        proxy_pass $UPSTREAM;
        proxy_http_version 1.1;

        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header X-Forwarded-Port 443;

        proxy_read_timeout 300;
        proxy_connect_timeout 300;
        proxy_send_timeout 300;
    }
}
EOF

ln -sfn "$CONF" "$ENABLED"

nginx -t
systemctl reload nginx

if [ -d "$WGER_DIR" ]; then
  cd "$WGER_DIR"
  sed -i "s|^SITE_URL=.*|SITE_URL=https://$DOMAIN|" config/prod.env
  grep -q '^ALLOWED_HOSTS=' config/prod.env \
    && sed -i "s|^ALLOWED_HOSTS=.*|ALLOWED_HOSTS=$DOMAIN,144.91.99.6,localhost,127.0.0.1|" config/prod.env \
    || echo "ALLOWED_HOSTS=$DOMAIN,144.91.99.6,localhost,127.0.0.1" >> config/prod.env

  docker compose down
  docker compose up -d
fi

sleep 20

curl -I "http://$DOMAIN" || true
curl -I "https://$DOMAIN" || true

echo ""
echo "HTTPS routing aplicado para $DOMAIN -> $UPSTREAM"
echo "Se https ainda retornar MarcaIA/Next, procure duplicidade em:"
echo "grep -Rni '$DOMAIN\|server_name .*marcaia.app' /etc/nginx/sites-enabled /etc/nginx/sites-available"
