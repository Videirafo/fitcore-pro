#!/usr/bin/env bash
set -euo pipefail
cd /opt/fitcore-pro
BASE="${FITCORE_PUBLIC_URL:-https://fitcore.marcaia.app}"
echo "MVP-33 — verificando console premium FitCore"
npm run site:next:check
npm run mvp28:check
npm run mvp29:check
npm run mvp30:check
npm run mvp31:check
npm run mvp32:check
npm run mvp33:check
npm --prefix apps/site run build >/tmp/fitcore-mvp33-build.log
systemctl is-active --quiet fitcore-api && echo "OK: fitcore-api ativa."
systemctl is-active --quiet fitcore-next && echo "OK: fitcore-next ativo."
for path in / /agents /biblioteca /execucao /evolucao /seguranca /auditoria /configuracoes /agenda /relatorios /financeiro /login /setup; do
  curl -fsSI "$BASE$path" | grep -q "x-fitcore-shell: next-shell" || { echo "ERRO: rota sem Next shell: $path" >&2; exit 1; }
  echo "OK: rota publicada: $path"
done
curl -fsS "$BASE/execucao" | grep -q "Exercícios do seu treino" && echo "OK: execução mostra treino com mídia."
curl -fsS "$BASE/execucao" | grep -q "/media/exercises/" && echo "OK: cards usam GIFs internos."
curl -fsS "$BASE/agents" | grep -q "IA para profissionais" && echo "OK: agents publicado."
curl -fsS "$BASE/biblioteca" | grep -q "Biblioteca de exercícios" && echo "OK: biblioteca publicada."
curl -fsSI "$BASE/media/exercises/0024-barbell-bench-front-squat.gif" | grep -E "HTTP/2 200|content-type: image/gif"
curl -fsS "$BASE/api/mvp-32/status" | grep -q '"enabled": true' && echo "OK: API MVP-32 ativa."
echo "MVP-33 verificado: console premium, papéis, agents, GIFs, segurança e rotas Next ativos."
