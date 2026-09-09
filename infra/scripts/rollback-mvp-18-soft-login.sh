#!/usr/bin/env bash
set -euo pipefail
cd /opt/fitcore-pro

echo "Rollback MVP-18: convites e usuários permanecem no banco."
echo "Para voltar ao modo soft de autenticação use: bash infra/scripts/rollback-mvp-15-soft-auth.sh"
echo "Nenhuma tabela será removida por segurança."
