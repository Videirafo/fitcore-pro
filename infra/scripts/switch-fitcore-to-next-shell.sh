#!/usr/bin/env bash
set -euo pipefail
DOMAIN="fitcore.marcaia.app"
ROOT="/opt/fitcore-pro"
SITE="$ROOT/apps/site"
STATIC="$ROOT/apps/site-static"
API="http://127.0.0.1:8091"
NEXT="http://127.0.0.1:3001"
CONF="/etc/nginx/sites-available/$DOMAIN"
ENABLED="/etc/nginx/sites-enabled/$DOMAIN"
CERT_DIR="/etc/letsencrypt/live/$DOMAIN"
if [ "$(id -u)" -ne 0 ]; then echo "ERRO: rode como root."; exit 1; fi
if [ ! -d "$SITE" ]; then echo "ERRO: Next app ausente em $SITE"; exit 1; fi
if [ ! -f "$CERT_DIR/fullchain.pem" ] || [ ! -f "$CERT_DIR/privkey.pem" ]; then echo "ERRO: certificado ausente."; exit 1; fi
systemctl stop fitcore-next 2>/dev/null || true
PIDS=$(ss -ltnp 'sport = :3001' 2>/dev/null | sed -n 's/.*pid=\([0-9]\+\).*/\1/p' | sort -u | tr '\n' ' ')
if [ -n "${PIDS:-}" ]; then echo "Liberando porta 3001: $PIDS"; kill $PIDS || true; sleep 2; fi
cd "$SITE"
npm run build
cat > /etc/systemd/system/fitcore-next.service <<SERVICE
[Unit]
Description=FitCore Pro Next Shell
After=network.target fitcore-api.service
Wants=fitcore-api.service

[Service]
Type=simple
WorkingDirectory=$SITE
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=3001

[Install]
WantedBy=multi-user.target
SERVICE
systemctl daemon-reload
systemctl disable fitcore-site >/dev/null 2>&1 || true
systemctl stop fitcore-site >/dev/null 2>&1 || true
systemctl enable fitcore-next >/dev/null
systemctl restart fitcore-next
sleep 3
curl -fsS "$NEXT" >/dev/null
chmod o+x /opt "$ROOT" "$ROOT/apps" "$STATIC" "$SITE" || true
find "$STATIC" -type d -exec chmod 755 {} \;
find "$STATIC" -type f -exec chmod 644 {} \;
BACKUP="$CONF.bak.next-shell.$(date +%Y%m%d-%H%M%S)"
[ -f "$CONF" ] && cp "$CONF" "$BACKUP" && echo "Backup criado: $BACKUP"
cat > "$CONF" <<NGINX
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
    add_header X-FitCore-Shell "next-shell" always;
    add_header X-FitCore-Engine "wger-internal" always;
    location = /health {
        default_type text/plain;
        return 200 "fitcore-shell=next\nnext=$NEXT\napi=$API\nengine=http://127.0.0.1:8088\n";
    }
    location /api/ {
        proxy_pass $API/api/;
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
    location /media/ {
        root $STATIC;
        try_files \$uri =404;
        expires 1h;
        add_header Cache-Control "public, max-age=3600" always;
    }
    location ~ ^/(mvp-[0-9]+\.html|mvp-[0-9]+\.css|mvp-[0-9]+\.js|mvp-17-nav-rbac\.js|mvp-17-nav-rbac\.css|fitcore-system\.css|fitcore-polish\.js|styles\.css|script\.js|fitcore-overrides\.css|exercise-media\.js|legal-.*\.html)$ {
        root $STATIC;
        try_files \$uri =404;
    }
    location = /legal/privacy { root $STATIC; try_files /legal-privacy.html =404; }
    location = /legal/security { root $STATIC; try_files /legal-security.html =404; }
    location = /legal/terms { root $STATIC; try_files /legal-terms.html =404; }
    location = /legal/open-source { root $STATIC; try_files /legal-open-source.html =404; }
    location / {
        proxy_pass $NEXT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 120;
        proxy_connect_timeout 30;
        proxy_send_timeout 120;
    }
}
NGINX
ln -sfn "$CONF" "$ENABLED"
nginx -t
systemctl reload nginx
curl -fsSI "https://$DOMAIN/" | grep -E 'HTTP/2 200|x-fitcore-shell: next-shell'
curl -fsSI "https://$DOMAIN/login" | grep -E 'HTTP/2 200|x-fitcore-shell: next-shell'
curl -fsSI "https://$DOMAIN/evolucao" | grep -E 'HTTP/2 200|x-fitcore-shell: next-shell'
curl -fsSI "https://$DOMAIN/api/health" | grep -E 'HTTP/2 200|x-fitcore-api'
echo "FitCore Next shell ativo em https://$DOMAIN"
