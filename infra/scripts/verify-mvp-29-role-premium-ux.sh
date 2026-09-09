#!/usr/bin/env bash
set -euo pipefail
ROOT="/opt/fitcore-pro"
BASE="https://fitcore.marcaia.app"
cd "$ROOT"

echo "MVP-29 — verificando UX operacional premium por papel"
node tools/check-next-app.mjs
node tools/check-mvp-28-next-operational-ui.mjs
node tools/check-mvp-29-role-premium-ux.mjs
npm run site:next:build >/tmp/fitcore-mvp29-next-build.log
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
for route in / /login /onboarding /equipe /alunos /treinos /execucao /evolucao; do
  headers="$(curl -fsSI "$BASE$route")"
  echo "$headers" | grep -q 'HTTP/2 200'
  echo "$headers" | grep -qi 'x-fitcore-shell: next-shell'
  html="$(curl -fsS "$BASE$route")"
  echo "$html" | grep -q '__next'
  echo "$html" | grep -q 'FitCore Pro'
  echo "OK: rota premium Next publicada: $route"
done
curl -fsSI "$BASE/api/health" | grep -q 'HTTP/2 200'
curl -fsSI "$BASE/api/health" | grep -qi 'x-fitcore-api: owned-api'
echo "OK: API própria preservada."
curl -fsSI "$BASE/media/exercises/0026-barbell-bench-squat.gif?mvp29=$(date +%s)" | grep -q 'HTTP/2 200'
echo "OK: mídia de exercício preservada."
echo "MVP-29 verificado: dashboard por papel, estados profissionais, navegação ativa, mobile refinado e ações escondidas por papel."
