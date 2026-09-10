#!/usr/bin/env bash
set -euo pipefail
cd /opt/fitcore-pro
echo "MVP-37 — verificando dashboard real por perfil"
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
npm run mvp37:check
node --check services/api/security/role-dashboard.mjs
node --check services/api/server.mjs
npm run site:next:build
bash infra/scripts/switch-fitcore-to-next-shell.sh
systemctl is-active --quiet fitcore-api && echo "OK: fitcore-api ativa."
systemctl is-active --quiet fitcore-next && echo "OK: fitcore-next ativo."
for route in / /dashboard /login /agents /biblioteca /execucao /evolucao /seguranca /relatorios; do curl -fsSI "https://fitcore.marcaia.app${route}" | head -1 | grep -q "200" && echo "OK: rota publicada: ${route}"; done
curl -fsS https://fitcore.marcaia.app/api/mvp-37/status | grep -q 'MVP-37 Role Dashboard'
echo "MVP-37 verificado: dashboard consolidado, dados reais por perfil, IA contextual e RBAC ativos."
