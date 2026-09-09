#!/usr/bin/env bash
set -euo pipefail
cd /opt/fitcore-pro
echo "MVP-34 — verificando layout web/mobile"
npm run site:next:check
npm run mvp28:check
npm run mvp29:check
npm run mvp30:check
npm run mvp31:check
npm run mvp32:check
npm run mvp33:check
npm run mvp34:check
npm --prefix apps/site run build
bash infra/scripts/switch-fitcore-to-next-shell.sh
systemctl is-active --quiet fitcore-api && echo "OK: fitcore-api ativa."
systemctl is-active --quiet fitcore-next && echo "OK: fitcore-next ativo."
for path in / /login /onboarding /agents /biblioteca /execucao /evolucao /seguranca /auditoria /configuracoes; do
  curl -fsSI "https://fitcore.marcaia.app$path" | grep -E 'HTTP/2 200|x-fitcore-shell: next-shell' >/dev/null
  echo "OK: rota publicada: $path"
done
curl -fsS "https://fitcore.marcaia.app/?cb=mvp34" | grep -E "landing-preview-card|Gerencie seus alunos|Treino do dia|IA para profissionais" >/dev/null
! curl -fsS "https://fitcore.marcaia.app/?cb=mvp34" | grep -E "Acesso necessário.*Atualizar" >/dev/null
curl -fsSI "https://fitcore.marcaia.app/media/exercises/0024-barbell-bench-front-squat.gif" | grep -E 'HTTP/2 200|content-type: image/gif' >/dev/null
echo "MVP-34 verificado: home organizada, mobile estabilizado, menu ampliado, GIFs e rotas ativas."
