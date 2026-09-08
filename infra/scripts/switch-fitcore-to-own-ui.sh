#!/usr/bin/env bash

# ============================================================
# FITCORE PRO - SWITCH TO OWN UI
# Faz https://fitcore.marcaia.app servir a UI propria do FitCore,
# mantendo wger apenas como engine interna em 127.0.0.1:8088.
# ============================================================

set -euo pipefail

DOMAIN="fitcore.marcaia.app"
ROOT="/opt/fitcore-pro"
SITE_DIR="$ROOT/apps/site-static"
UPSTREAM_WGER="http://127.0.0.1:8088"
CONF="/etc/nginx/sites-available/$DOMAIN"
ENABLED="/etc/nginx/sites-enabled/$DOMAIN"
CERT_DIR="/etc/letsencrypt/live/$DOMAIN"

if [ "$(id -u)" -ne 0 ]; then
  echo "ERRO: rode como root."
  exit 1
fi

if [ ! -d "$SITE_DIR" ]; then
  echo "ERRO: UI estatica nao encontrada em $SITE_DIR"
  exit 1
fi

if [ ! -f "$SITE_DIR/index.html" ]; then
  echo "ERRO: index.html nao encontrado em $SITE_DIR"
  exit 1
fi

if [ ! -f "$CERT_DIR/fullchain.pem" ] || [ ! -f "$CERT_DIR/privkey.pem" ]; then
  echo "ERRO: certificado nao encontrado em $CERT_DIR."
  echo "Rode antes: certbot --nginx -d $DOMAIN"
  exit 1
fi

BACKUP="$CONF.bak.own-ui.$(date +%Y%m%d-%H%M%S)"
if [ -f "$CONF" ]; then
  cp "$CONF" "$BACKUP"
  echo "Backup criado: $BACKUP"
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

    root $SITE_DIR;
    index index.html;

    add_header X-FitCore-Shell "owned-ui" always;
    add_header X-FitCore-Engine "wger-internal" always;

    location = /health {
        default_type text/plain;
        return 200 "fitcore-ui=ok\nengine=$UPSTREAM_WGER\nmedia_policy=textual_only\n";
    }

    location = /legal/open-source {
        try_files /legal-open-source.html =404;
    }

    location = /api/exercises/normalized.json {
        alias $ROOT/storage/exercises-dataset/exercises.normalized.json;
        default_type application/json;
        add_header Cache-Control "no-store" always;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
EOF

ln -sfn "$CONF" "$ENABLED"

nginx -t
systemctl reload nginx

echo ""
echo "FitCore UI propria ativada em https://$DOMAIN"
echo "wger continua interno em $UPSTREAM_WGER"
echo ""
echo "Testes:"
curl -I "https://$DOMAIN" || true
curl -I "https://$DOMAIN/health" || true
curl -I "https://$DOMAIN/api/exercises/normalized.json" || true
