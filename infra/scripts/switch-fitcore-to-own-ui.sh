#!/usr/bin/env bash
# Compatibility wrapper kept for old deploy commands.
# Since MVP-27 the public FitCore runtime is the Next shell, not the legacy static UI.
set -euo pipefail
ROOT="/opt/fitcore-pro"
NEXT_SCRIPT="$ROOT/infra/scripts/switch-fitcore-to-next-shell.sh"
if [ ! -f "$NEXT_SCRIPT" ]; then
  echo "ERRO: Next shell deploy script não encontrado em $NEXT_SCRIPT"
  exit 1
fi
echo "Aviso: switch-fitcore-to-own-ui.sh agora delega para o Shell Next canônico."
exec bash "$NEXT_SCRIPT" "$@"
