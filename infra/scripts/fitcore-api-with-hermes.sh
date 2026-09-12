#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${MARCAIA_ENV_FILE:-/etc/marcaia/web.env}"
[[ -r "$ENV_FILE" ]] || { echo "FitCore Hermes env source unavailable" >&2; exit 78; }
# Source as shell variables only; MarcaIA variables are not mass-exported.
# shellcheck disable=SC1090
source "$ENV_FILE"
HERMES_TOKEN="${HERMES_GATEWAY_INTERNAL_TOKEN:-}"
[[ ${#HERMES_TOKEN} -ge 32 ]] || { echo "FitCore Hermes token unavailable" >&2; exit 78; }
PROVIDER_TIMEOUT_MS="${HERMES_PROVIDER_TIMEOUT_MS:-45000}"
[[ "$PROVIDER_TIMEOUT_MS" =~ ^[0-9]+$ ]] && (( PROVIDER_TIMEOUT_MS >= 1000 && PROVIDER_TIMEOUT_MS <= 90000 )) || { echo "FitCore Hermes provider timeout invalid" >&2; exit 78; }
GATEWAY_TIMEOUT_MS=$(( PROVIDER_TIMEOUT_MS * 2 + 15000 ))
(( GATEWAY_TIMEOUT_MS < 120000 )) && GATEWAY_TIMEOUT_MS=120000

export FITCORE_HERMES_GATEWAY_ENABLED=true
export FITCORE_HERMES_GATEWAY_URLS="http://127.0.0.1:3411/api/internal/hermes/provider,http://127.0.0.1:3413/api/internal/hermes/provider"
export FITCORE_HERMES_GATEWAY_TOKEN="$HERMES_TOKEN"
export FITCORE_HERMES_GATEWAY_TIMEOUT_MS="$GATEWAY_TIMEOUT_MS"
unset HERMES_GATEWAY_INTERNAL_TOKEN HERMES_TOKEN HERMES_PROVIDER_TIMEOUT_MS

exec /usr/bin/node "$1"
