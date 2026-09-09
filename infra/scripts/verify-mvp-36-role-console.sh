#!/usr/bin/env bash
set -euo pipefail
cd /opt/fitcore-pro
printf 'MVP-36 — verificando console interno real por perfil\n'
npm run site:next:check
npm run mvp28:check
npm run mvp29:check
npm run mvp30:check
npm run mvp31:check
npm run mvp32:check
npm run mvp33:check
npm run mvp34:check
npm run mvp35:check
npm run mvp36:check
npm --prefix apps/site run build
bash infra/scripts/switch-fitcore-to-next-shell.sh
systemctl is-active --quiet fitcore-api && echo 'OK: fitcore-api ativa.'
systemctl is-active --quiet fitcore-next && echo 'OK: fitcore-next ativo.'
for path in / /dashboard /login /agents /biblioteca /execucao /evolucao /seguranca /relatorios; do
  curl -fsSI "https://fitcore.marcaia.app${path}" | grep -q 'HTTP/2 200' || { echo "ERRO: rota não publicada: ${path}"; exit 1; }
  echo "OK: rota publicada: ${path}"
done
curl -fsSI https://fitcore.marcaia.app/media/exercises/0024-barbell-bench-front-squat.gif | grep -qi 'content-type: image/gif' || { echo 'ERRO: GIF interno indisponível'; exit 1; }
curl -fsS https://fitcore.marcaia.app/dashboard | grep -q 'Dashboard operacional por perfil' || { echo 'ERRO: /dashboard sem console por perfil'; exit 1; }
curl -fsS https://fitcore.marcaia.app/biblioteca | grep -q 'Biblioteca de exercícios com GIF' || { echo 'ERRO: biblioteca sem GIFs'; exit 1; }
echo 'MVP-36 verificado: console do dono/professor/aluno, IA, GIFs, filtros, navegação e segurança ativos.'
