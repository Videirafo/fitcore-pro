#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SECRET_DIR="${FITCORE_MOBILE_SECRET_DIR:-/opt/fitcore-pro/storage/secrets/mobile/android}"
KEYSTORE="$SECRET_DIR/fitcore-upload.p12"
SECRET_PROPERTIES="$SECRET_DIR/key.properties"
PROJECT_PROPERTIES="$ROOT/apps/mobile/android/key.properties"
ALIAS="${FITCORE_ANDROID_KEY_ALIAS:-fitcore-upload}"

umask 077
mkdir -p "$SECRET_DIR"

if [[ -e "$KEYSTORE" || -e "$SECRET_PROPERTIES" ]]; then
  echo "ERRO: material de assinatura já existe em $SECRET_DIR; rotação exige procedimento explícito." >&2
  exit 2
fi

command -v keytool >/dev/null || { echo "ERRO: keytool não encontrado." >&2; exit 3; }
command -v openssl >/dev/null || { echo "ERRO: openssl não encontrado." >&2; exit 3; }

STORE_PASSWORD="$(openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c 40)"
KEY_PASSWORD="$STORE_PASSWORD"

keytool -genkeypair \
  -keystore "$KEYSTORE" \
  -storetype PKCS12 \
  -storepass "$STORE_PASSWORD" \
  -keypass "$KEY_PASSWORD" \
  -alias "$ALIAS" \
  -keyalg RSA \
  -keysize 4096 \
  -validity 10000 \
  -dname "CN=FitCore Upload, OU=Mobile, O=MarcaIA, L=Saquarema, ST=RJ, C=BR" \
  >/dev/null

cat > "$SECRET_PROPERTIES" <<EOF
storeFile=$KEYSTORE
storePassword=$STORE_PASSWORD
keyAlias=$ALIAS
keyPassword=$KEY_PASSWORD
EOF
chmod 600 "$KEYSTORE" "$SECRET_PROPERTIES"

ln -sfn "$SECRET_PROPERTIES" "$PROJECT_PROPERTIES"

FINGERPRINT="$(keytool -list -v -keystore "$KEYSTORE" -storepass "$STORE_PASSWORD" -alias "$ALIAS" | awk -F': ' '/SHA256:/{print $2; exit}')"
printf '%s\n' "$FINGERPRINT" > "$SECRET_DIR/upload-cert-sha256.txt"
chmod 600 "$SECRET_DIR/upload-cert-sha256.txt"

echo "OK: upload keystore criado fora do Git."
echo "Diretório: $SECRET_DIR"
echo "SHA-256 do certificado de upload: $FINGERPRINT"
echo "IMPORTANTE: faça backup seguro de fitcore-upload.p12 e key.properties antes do primeiro upload na Play Console."
