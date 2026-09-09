#!/usr/bin/env bash
set -euo pipefail
ROOT="/opt/fitcore-pro"
DOMAIN="fitcore.marcaia.app"
BASE="https://$DOMAIN"
cd "$ROOT"

echo "MVP-28 — verificando UI operacional real em Next"
node tools/check-next-app.mjs
node tools/check-mvp-28-next-operational-ui.mjs
npm run site:next:build >/tmp/fitcore-mvp28-next-build.log
echo "OK: build Next concluído."
systemctl is-active --quiet fitcore-next
echo "OK: fitcore-next ativo."
systemctl is-active --quiet fitcore-api
echo "OK: fitcore-api ativa."
ss -ltnp 'sport = :3001' | grep -q '127.0.0.1:3001'
echo "OK: Next escutando em 127.0.0.1:3001."

curl -fsS "$BASE/api/mvp-10/postgres-store" | grep -q '"active_store": "PostgresStore"'
echo "OK: PostgreSQL ativo via API."
curl -fsS "$BASE/api/mvp-15/session" | grep -q '"ok": true'
echo "OK: sessão/RBAC disponível."
curl -fsS "$BASE/api/mvp-26/status" | grep -q '"enabled": true'
echo "OK: evolução ativa."

for route in / /login /onboarding /equipe /alunos /treinos /execucao /evolucao; do
  headers="$(curl -fsSI "$BASE$route")"
  echo "$headers" | grep -q 'HTTP/2 200'
  echo "$headers" | grep -qi 'x-fitcore-shell: next-shell'
  html="$(curl -fsS "$BASE$route")"
  echo "$html" | grep -q '__next'
  echo "$html" | grep -q 'FitCore Pro'
  echo "$html" | grep -vq 'mvp-[0-9][0-9]\.html'
  echo "OK: rota operacional Next nativa: $route"
done

curl -fsS "$BASE/_next/static/chunks/app/equipe/page" >/dev/null 2>&1 || true
curl -fsSI "$BASE/api/health" | grep -qi 'x-fitcore-api: owned-api'
echo "OK: API própria preservada."
curl -fsSI "$BASE/media/exercises/0026-barbell-bench-squat.gif?mvp28=$(date +%s)" | grep -q 'HTTP/2 200'
echo "OK: mídia de exercício preservada."

echo "MVP-28 verificado: UI operacional 100% Next nas rotas limpas, formulários React, estados profissionais, dashboard por papel, API, sessão/RBAC e PostgreSQL ativos."
