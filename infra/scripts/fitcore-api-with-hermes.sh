#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${MARCAIA_ENV_FILE:-/etc/marcaia/web.env}"
[[ -r "$ENV_FILE" ]] || { echo "FitCore Hermes env source unavailable" >&2; exit 78; }
# Source as shell variables only; MarcaIA variables are not mass-exported.
# shellcheck disable=SC1090
source "$ENV_FILE"
HERMES_TOKEN="${HERMES_GATEWAY_INTERNAL_TOKEN:-}"
[[ ${#HERMES_TOKEN} -ge 32 ]] || { echo "FitCore Hermes token unavailable" >&2; exit 78; }

# The public Nginx API proxy closes at 120s. Keep enough budget for
# dashboard DB work plus deterministic local fallback after Hermes aborts.
FITCORE_GATEWAY_TIMEOUT_MS=90000

export FITCORE_HERMES_GATEWAY_ENABLED=true
export FITCORE_HERMES_GATEWAY_URLS="http://127.0.0.1:3411/api/internal/hermes/provider,http://127.0.0.1:3413/api/internal/hermes/provider"
export FITCORE_HERMES_GATEWAY_TOKEN="$HERMES_TOKEN"
export FITCORE_HERMES_GATEWAY_TIMEOUT_MS="$FITCORE_GATEWAY_TIMEOUT_MS"
unset HERMES_GATEWAY_INTERNAL_TOKEN HERMES_TOKEN

exec /usr/bin/node "$1"
