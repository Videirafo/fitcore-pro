#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="${FITCORE_PROJECT_ROOT:-/opt/fitcore-pro}"
SOURCE_DIR="${1:-$PROJECT_ROOT/apps/site-static/media/imported/hasaneyldrm-exercises-dataset/videos}"
DEST_DIR="${2:-$PROJECT_ROOT/apps/site-static/media/exercises}"
MEDIA_MAP="$PROJECT_ROOT/apps/site-static/exercise-media.js"

if [ ! -d "$SOURCE_DIR" ]; then
  echo "ERRO: pasta de origem não encontrada: $SOURCE_DIR" >&2
  echo "Antes, importe o repositório:" >&2
  echo "  bash infra/scripts/import-exercise-media-from-github.sh hasaneyldrm/exercises-dataset main" >&2
  exit 64
fi

if [ ! -f "$MEDIA_MAP" ]; then
  echo "ERRO: mapa de mídia não encontrado: $MEDIA_MAP" >&2
  exit 65
fi

mkdir -p "$DEST_DIR"

mapfile -t SLUGS < <(
  grep -Eo '"[0-9]{4}-[^"]+"[[:space:]]*:' "$MEDIA_MAP" \
    | sed -E 's/^"//; s/"[[:space:]]*:$//' \
    | sort -u
)

if [ "${#SLUGS[@]}" -eq 0 ]; then
  echo "ERRO: nenhum slug encontrado em $MEDIA_MAP" >&2
  exit 66
fi

COPIED=0
MISSING=0

echo "Origem: $SOURCE_DIR"
echo "Destino: $DEST_DIR"
echo

for slug in "${SLUGS[@]}"; do
  id="${slug%%-*}"
  src="$(find "$SOURCE_DIR" -maxdepth 1 -type f -iname "${id}-*.gif" | head -n 1 || true)"

  if [ -z "$src" ]; then
    printf 'SEM GIF: %s\n' "$slug"
    MISSING=$((MISSING + 1))
    continue
  fi

  dest="$DEST_DIR/$slug.gif"
  cp -f "$src" "$dest"
  chmod 644 "$dest"
  printf 'OK: %s <- %s\n' "$slug.gif" "$(basename "$src")"
  COPIED=$((COPIED + 1))
done

echo
echo "Resumo: $COPIED GIF(s) publicados, $MISSING sem arquivo correspondente."
echo

echo "Validação rápida:"
find "$DEST_DIR" -maxdepth 1 -type f -name '*.gif' -printf '%f\n' | sort | head -30

echo
echo "Atenção: mídia importada do dataset hasaneyldrm/exercises-dataset possui termos próprios de mídia/Gym visual. Mantenha atribuição e revise licença antes de uso comercial amplo."
