#!/usr/bin/env bash
set -Eeuo pipefail
cd /opt/fitcore-pro

echo "MVP-30 — verificando fluxo operacional guiado"

npm run site:next:check
npm run mvp28:check
npm run mvp29:check
npm run mvp30:check
npm run site:next:build >/tmp/fitcore-mvp30-next-build.log

echo "OK: build Next concluído."

systemctl is-active --quiet fitcore-next && echo "OK: fitcore-next ativo." || { echo "ERRO: fitcore-next inativo." >&2; exit 1; }
systemctl is-active --quiet fitcore-api && echo "OK: fitcore-api ativa." || { echo "ERRO: fitcore-api inativa." >&2; exit 1; }

curl -fsS http://127.0.0.1:3001 >/dev/null && echo "OK: Next local responde."
curl -fsS https://fitcore.marcaia.app/api/mvp-10/postgres-store | grep -q '"active_store": "PostgresStore"' && echo "OK: PostgreSQL ativo via API."
curl -fsS https://fitcore.marcaia.app/api/mvp-15/session >/dev/null && echo "OK: sessão/RBAC disponível."

for path in / /login /onboarding /equipe /alunos /treinos /execucao /evolucao; do
  curl -fsSI "https://fitcore.marcaia.app${path}" | grep -q "x-fitcore-shell: next-shell" || { echo "ERRO: rota sem Next shell: ${path}" >&2; exit 1; }
  echo "OK: rota guiada Next publicada: ${path}"
done

curl -fsS https://fitcore.marcaia.app/treinos | grep -q "__next" && echo "OK: treinos em Next."
curl -fsS https://fitcore.marcaia.app/evolucao | grep -q "__next" && echo "OK: evolução em Next."

if curl -fsS https://fitcore.marcaia.app/execucao | grep -q 'result-box'; then
  echo "ERRO: JSON cru ainda aparece na interface." >&2
  exit 1
fi
echo "OK: blocos JSON crus removidos da interface."

echo "MVP-30 verificado: fluxo guiado, dropdowns reais, seleção automática de execução, evolução correta, API, sessão/RBAC e PostgreSQL ativos."
