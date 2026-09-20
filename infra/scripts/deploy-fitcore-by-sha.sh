#!/usr/bin/env bash
set -Eeuo pipefail

EXPECTED_SHA="${1:-}"
REPO_DIR="${FITCORE_REPO_DIR:-/opt/fitcore-pro}"
RELEASE_ROOT="${FITCORE_RELEASE_ROOT:-/opt/fitcore-releases}"
API_SERVICE="${FITCORE_API_SERVICE:-fitcore-api.service}"
NEXT_SERVICE="${FITCORE_NEXT_SERVICE:-fitcore-next.service}"
API_DROPIN="${FITCORE_API_RELEASE_DROPIN:-/etc/systemd/system/fitcore-api.service.d/05-release.conf}"
NEXT_DROPIN="${FITCORE_NEXT_RELEASE_DROPIN:-/etc/systemd/system/fitcore-next.service.d/10-release.conf}"
WRAPPER="${FITCORE_HERMES_WRAPPER:-/usr/local/libexec/fitcore-api-with-hermes}"
PUBLIC_URL="${FITCORE_PUBLIC_URL:-https://fitcore.marcaia.app}"
API_URL="${FITCORE_API_LOCAL_URL:-http://127.0.0.1:8091}"
NEXT_URL="${FITCORE_NEXT_LOCAL_URL:-http://127.0.0.1:3001}"

[[ $EUID -eq 0 ]] || { echo "ERRO: execute como root." >&2; exit 1; }
[[ "$EXPECTED_SHA" =~ ^[a-f0-9]{40}$ ]] || {
  echo "Uso: $0 <commit-sha-de-40-caracteres>" >&2
  exit 1
}

for bin in git npm node systemctl curl install mktemp; do
  command -v "$bin" >/dev/null 2>&1 || { echo "ERRO: comando ausente: $bin" >&2; exit 1; }
done
[[ -d "$REPO_DIR/.git" || -f "$REPO_DIR/.git" ]] || { echo "ERRO: repo ausente: $REPO_DIR" >&2; exit 1; }

wait_http() {
  local url="$1" label="$2" attempts="${3:-30}"
  for attempt in $(seq 1 "$attempts"); do
    if curl -fsS --max-time 3 "$url" >/dev/null 2>&1; then
      echo "$label=PASS"
      return 0
    fi
    sleep 0.5
  done
  echo "ERRO: $label não respondeu em $url" >&2
  return 1
}

service_has_sha() {
  local service="$1"
  systemctl show "$service" -p Environment --value \
    | tr ' ' '\n' \
    | grep -Fxq "FITCORE_RELEASE_SHA=$EXPECTED_SHA"
}

mkdir -p "$RELEASE_ROOT"
git -C "$REPO_DIR" fetch origin main --quiet
git -C "$REPO_DIR" cat-file -e "${EXPECTED_SHA}^{commit}"
git -C "$REPO_DIR" merge-base --is-ancestor "$EXPECTED_SHA" origin/main || {
  echo "ERRO: SHA não pertence ao origin/main atual." >&2
  exit 1
}
RELEASE_DIR="$RELEASE_ROOT/$EXPECTED_SHA"
PREVIOUS_API_DROPIN="$(mktemp /tmp/fitcore-api-release.XXXXXX)"
PREVIOUS_NEXT_DROPIN="$(mktemp /tmp/fitcore-next-release.XXXXXX)"
PREVIOUS_WRAPPER="$(mktemp /tmp/fitcore-hermes-wrapper.XXXXXX)"
cp "$API_DROPIN" "$PREVIOUS_API_DROPIN"
cp "$NEXT_DROPIN" "$PREVIOUS_NEXT_DROPIN"
cp "$WRAPPER" "$PREVIOUS_WRAPPER"
ROLLBACK_ARMED=0

cleanup() {
  rm -f "$PREVIOUS_API_DROPIN" "$PREVIOUS_NEXT_DROPIN" "$PREVIOUS_WRAPPER"
}

rollback() {
  local code=$?
  echo "deploy=FAIL rollback=START code=$code" >&2
  if [[ $ROLLBACK_ARMED -eq 1 ]]; then
    install -m 0644 "$PREVIOUS_API_DROPIN" "$API_DROPIN" || true
    install -m 0644 "$PREVIOUS_NEXT_DROPIN" "$NEXT_DROPIN" || true
    install -m 0700 "$PREVIOUS_WRAPPER" "$WRAPPER" || true
    systemctl daemon-reload || true
    systemctl restart "$API_SERVICE" || true
    wait_http "$API_URL/api/health" rollback_api 20 || true
    systemctl restart "$NEXT_SERVICE" || true
    wait_http "$NEXT_URL/" rollback_next 20 || true
  fi
  cleanup
  exit "$code"
}
trap rollback ERR
trap cleanup EXIT
if [[ -e "$RELEASE_DIR" ]]; then
  ACTUAL_RELEASE_SHA="$(git -C "$RELEASE_DIR" rev-parse HEAD 2>/dev/null || true)"
  [[ "$ACTUAL_RELEASE_SHA" == "$EXPECTED_SHA" ]] || {
    echo "ERRO: release existente não corresponde ao SHA esperado." >&2
    false
  }
else
  git -C "$REPO_DIR" worktree add --detach "$RELEASE_DIR" "$EXPECTED_SHA"
fi

cd "$RELEASE_DIR"
[[ "$(git rev-parse HEAD)" == "$EXPECTED_SHA" ]]

echo "=== gates da release $EXPECTED_SHA ==="
npm ci
npm --prefix apps/site ci
npm run check:project
npm run mvp32:check
npm run all:ui-gates
npm run site:next:build

SERVICE_ENV="$(systemctl show "$API_SERVICE" -p Environment --value)"
DB_URL=""
if [[ "$SERVICE_ENV" =~ FITCORE_DATABASE_URL=([^\"\ ]+) ]]; then
  DB_URL="${BASH_REMATCH[1]}"
fi
unset SERVICE_ENV
[[ -n "$DB_URL" ]] || { echo "ERRO: FITCORE_DATABASE_URL não encontrado no serviço atual." >&2; false; }
FITCORE_DATABASE_URL="$DB_URL" bash infra/scripts/apply-execution-kernel-v2.sh
FITCORE_DATABASE_URL="$DB_URL" bash infra/scripts/apply-execution-analytics.sh
unset DB_URL

[[ -x infra/scripts/fitcore-api-with-hermes.sh ]] || {
  echo "ERRO: wrapper Hermes versionado ausente." >&2
  false
}

API_TMP="$(mktemp /tmp/fitcore-api-dropin.XXXXXX)"
NEXT_TMP="$(mktemp /tmp/fitcore-next-dropin.XXXXXX)"
cat >"$API_TMP" <<EOF
[Service]
WorkingDirectory=$RELEASE_DIR
ExecStart=
ExecStart=$WRAPPER $RELEASE_DIR/services/api/server.mjs
Environment=FITCORE_RELEASE_SHA=$EXPECTED_SHA
EOF
cat >"$NEXT_TMP" <<EOF
[Service]
WorkingDirectory=$RELEASE_DIR/apps/site
Environment=FITCORE_RELEASE_SHA=$EXPECTED_SHA
EOF

install -m 0700 infra/scripts/fitcore-api-with-hermes.sh "$WRAPPER"
install -m 0644 "$API_TMP" "$API_DROPIN"
install -m 0644 "$NEXT_TMP" "$NEXT_DROPIN"
rm -f "$API_TMP" "$NEXT_TMP"
ROLLBACK_ARMED=1

systemctl daemon-reload
systemctl restart "$API_SERVICE"
wait_http "$API_URL/api/health" api_health 30
service_has_sha "$API_SERVICE" || { echo "ERRO: API não expõe o SHA esperado." >&2; false; }

systemctl restart "$NEXT_SERVICE"
wait_http "$NEXT_URL/" next_local 30
service_has_sha "$NEXT_SERVICE" || { echo "ERRO: Next não expõe o SHA esperado." >&2; false; }

curl -fsS --max-time 8 "$PUBLIC_URL/api/health" >/dev/null
curl -fsS --max-time 8 "$PUBLIC_URL/login" >/dev/null
curl -fsS --max-time 8 "$PUBLIC_URL/" >/dev/null
STATUS_JSON="$(curl -fsS --max-time 8 "$PUBLIC_URL/api/mvp-32/status")"
node -e 'const x=JSON.parse(process.argv[1]); if(!x.ok) process.exit(2)' "$STATUS_JSON"

systemctl is-active --quiet "$API_SERVICE"
systemctl is-active --quiet "$NEXT_SERVICE"
ROLLBACK_ARMED=0
trap - ERR

echo "deploy=PASS"
echo "release_sha=$EXPECTED_SHA"
echo "api_release=$(systemctl show "$API_SERVICE" -p WorkingDirectory --value)"
echo "next_release=$(systemctl show "$NEXT_SERVICE" -p WorkingDirectory --value)"
