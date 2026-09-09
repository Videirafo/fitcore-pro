#!/usr/bin/env bash

# ============================================================
# FITCORE PRO - SWITCH TO OWN UI
# Faz https://fitcore.marcaia.app servir a UI propria do FitCore,
# mantendo wger apenas como engine interna em 127.0.0.1:8088.
# A API propria fica em 127.0.0.1:8091.
# ============================================================

set -euo pipefail

DOMAIN="fitcore.marcaia.app"
ROOT="/opt/fitcore-pro"
SITE_DIR="$ROOT/apps/site-static"
UPSTREAM_API="http://127.0.0.1:8091"
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

# A VPS pode ter ficado com umask 077 durante geração de secrets.
# Isso faz arquivos do git ficarem 600/700 e causa 403 no Nginx.
# Liberar somente leitura/travessia dos artefatos públicos da UI.
chmod o+x /opt || true
chmod o+x "$ROOT" "$ROOT/apps" "$SITE_DIR" || true
find "$SITE_DIR" -type d -exec chmod 755 {} \;
find "$SITE_DIR" -type f -exec chmod 644 {} \;

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
        return 200 "fitcore-ui=ok\napi=$UPSTREAM_API\nengine=$UPSTREAM_WGER\nmedia_policy=textual_only\n";
    }

    location = /legal/open-source {
        try_files /legal-open-source.html =404;
    }

    location = /legal/privacy {
        try_files /legal-privacy.html =404;
    }

    location = /legal/security {
        try_files /legal-security.html =404;
    }

    location = /legal/terms {
        try_files /legal-terms.html =404;
    }

    # Mídia pública do FitCore: nunca cair para index.html.
    # Se o GIF não existir, retorna 404 real. Isso evita cache HTML da Cloudflare no caminho de mídia.
    location /media/ {
        try_files \$uri =404;
        expires 1h;
        add_header Cache-Control "public, max-age=3600" always;
    }

    location /api/ {
        proxy_pass $UPSTREAM_API/api/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header X-Forwarded-Port 443;
        proxy_read_timeout 120;
        proxy_connect_timeout 30;
        proxy_send_timeout 120;
    }

    location / {
        try_files \$uri /index.html;
    }
}
EOF

ln -sfn "$CONF" "$ENABLED"

nginx -t
systemctl reload nginx

echo ""
echo "FitCore UI propria ativada em https://$DOMAIN"
echo "API propria esperada em $UPSTREAM_API"
echo "wger continua interno em $UPSTREAM_WGER"
echo ""
echo "Testes:"
curl -I "https://$DOMAIN" || true
curl -I "https://$DOMAIN/health" || true
curl -I "https://$DOMAIN/api/health" || true
curl -I "https://$DOMAIN/legal/privacy" || true
curl -I "https://$DOMAIN/legal/security" || true
curl -I "https://$DOMAIN/media/exercises/0026-barbell-bench-squat.gif?fitcore-media-test=$(date +%s)" || true
