#!/usr/bin/env bash
set -euo pipefail
cd /opt/fitcore-pro
DOMAIN="https://fitcore.marcaia.app"
echo "MVP-35 — verificando landing pública e console operacional"
npm run site:next:check
npm run mvp28:check
npm run mvp29:check
npm run mvp30:check
npm run mvp31:check
npm run mvp32:check
npm run mvp33:check
npm run mvp34:check
npm run mvp35:check
npm --prefix apps/site run build
bash infra/scripts/switch-fitcore-to-next-shell.sh
systemctl is-active --quiet fitcore-api && echo "OK: fitcore-api ativa."
systemctl is-active --quiet fitcore-next && echo "OK: fitcore-next ativo."
for route in / /login /onboarding /agents /biblioteca /execucao /evolucao /seguranca; do
  curl -fsSI "$DOMAIN$route" | grep -q "HTTP/2 200" && echo "OK: rota publicada: $route"
done
curl -fsS "$DOMAIN/?v=$(date +%s)" > /tmp/fitcore-mvp35-home.html
grep -q "landing-shell" /tmp/fitcore-mvp35-home.html
grep -q "Gerencie seus alunos" /tmp/fitcore-mvp35-home.html
grep -q "landing-product-preview" /tmp/fitcore-mvp35-home.html
if grep -q "Acesso necessário" /tmp/fitcore-mvp35-home.html; then echo "ERRO: home pública ainda mostra acesso necessário"; exit 1; fi
if grep -q "Atualizar progresso" /tmp/fitcore-mvp35-home.html; then echo "ERRO: home pública ainda mostra ação operacional"; exit 1; fi
curl -fsSI "$DOMAIN/media/exercises/0024-barbell-bench-front-squat.gif" | grep -E 'HTTP/2 200|content-type: image/gif'
echo "MVP-35 verificado: landing pública organizada, console preservado e mobile/overflow estabilizados."
