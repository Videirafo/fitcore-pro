#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${MARCAIA_ENV_FILE:-/etc/marcaia/web.env}"
WRAPPER="/usr/local/libexec/fitcore-api-with-hermes"

if [ "$(id -u)" -ne 0 ]; then
  echo "ERRO: execute como root." >&2
  exit 1
fi
[ -r "$ENV_FILE" ] || { echo "ERRO: ambiente MarcaIA indisponível em $ENV_FILE" >&2; exit 78; }

install -d -m 0755 "$(dirname "$WRAPPER")"
cat > "$WRAPPER" <<'WRAPPER_EOF'
#!/usr/bin/env bash
set -euo pipefail
ENV_FILE="${MARCAIA_ENV_FILE:-/etc/marcaia/web.env}"
[ -r "$ENV_FILE" ] || { echo "FitCore Hermes env source unavailable" >&2; exit 78; }
# shellcheck disable=SC1090
source "$ENV_FILE"
HERMES_TOKEN="${HERMES_GATEWAY_INTERNAL_TOKEN:-}"
[ "${#HERMES_TOKEN}" -ge 32 ] || { echo "FitCore Hermes token unavailable" >&2; exit 78; }
export FITCORE_HERMES_GATEWAY_ENABLED=true
export FITCORE_HERMES_GATEWAY_URL="http://127.0.0.1:3411/api/internal/hermes/provider"
export FITCORE_HERMES_GATEWAY_TOKEN="$HERMES_TOKEN"
export FITCORE_HERMES_GATEWAY_TIMEOUT_MS="${FITCORE_HERMES_GATEWAY_TIMEOUT_MS:-120000}"
unset HERMES_GATEWAY_INTERNAL_TOKEN HERMES_TOKEN
exec /usr/bin/node "$1"
WRAPPER_EOF
chmod 0750 "$WRAPPER"
chown root:root "$WRAPPER"
bash -n "$WRAPPER"
echo "FitCore Hermes runtime wrapper instalado: $WRAPPER"
