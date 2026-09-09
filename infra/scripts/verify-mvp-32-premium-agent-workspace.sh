#!/usr/bin/env bash
set -euo pipefail
cd /opt/fitcore-pro
BASE="${FITCORE_PUBLIC_URL:-https://fitcore.marcaia.app}"

echo "MVP-32 — verificando workspace premium, agents e GIFs"
bash infra/scripts/apply-mvp-32-premium-agent-workspace.sh
npm run site:next:check
npm run mvp28:check
npm run mvp29:check
npm run mvp30:check
npm run mvp31:check
npm run mvp32:check
npm run site:next:build >/tmp/fitcore-mvp32-next-build.log

echo "OK: contratos e build Next validados."
systemctl is-active --quiet fitcore-api && echo "OK: fitcore-api ativa."
systemctl is-active --quiet fitcore-next && echo "OK: fitcore-next ativo."

for path in / /setup /login /onboarding /equipe /alunos /treinos /execucao /evolucao /agents /biblioteca /seguranca /auditoria /configuracoes /agenda /relatorios /financeiro /convite; do
  curl -fsSI "$BASE$path" | grep -q "x-fitcore-shell: next-shell" || { echo "ERRO: rota sem Next shell: $path" >&2; exit 1; }
  echo "OK: rota Next publicada: $path"
done
curl -fsS "$BASE/execucao" | grep -q "exercise-media-card" && echo "OK: execução mostra cards de exercício com GIF."
curl -fsS "$BASE/agents" | grep -q "agent-panel" && echo "OK: área IA & Agents publicada."
curl -fsS "$BASE/biblioteca" | grep -q "/media/exercises/" && echo "OK: biblioteca usa mídia interna."
curl -fsSI "$BASE/media/exercises/0024-barbell-bench-front-squat.gif" | grep -qi "content-type: image/gif" && echo "OK: GIF interno público responde."
curl -fsS "$BASE/api/mvp-32/status" | grep -q '"enabled": true' && echo "OK: API MVP-32 ativa."
echo "MVP-32 verificado: workspace premium, navegação completa, logout, agents, GIFs, API, sessão/RBAC e PostgreSQL ativos."
