#!/usr/bin/env bash
set -euo pipefail
rm -f /etc/systemd/system/fitcore-api.service.d/50-fitcore-students.conf
systemctl daemon-reload
systemctl restart fitcore-api
systemctl status --no-pager fitcore-api
cat <<'MSG'
MVP-23 rollback aplicado: endpoints de cadastro operacional de aluno ficam inativos por configuração.
Dados PostgreSQL, alunos e auditorias foram preservados.
MSG
