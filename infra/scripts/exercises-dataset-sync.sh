#!/usr/bin/env bash

# ============================================================
# FITCORE PRO - EXERCISES DATASET SYNC
# Sincroniza hasaneyldrm/exercises-dataset como fonte local.
# Política padrão: baixar somente dados/licença/documentação, sem mídia.
# ============================================================

set -euo pipefail

ROOT="/opt/fitcore-pro"
UPSTREAM_DIR="$ROOT/upstream/exercises-dataset"
WORK_DIR="$ROOT/storage/exercises-dataset"
REPO_URL="https://github.com/hasaneyldrm/exercises-dataset.git"

mkdir -p "$ROOT/upstream"
mkdir -p "$WORK_DIR"

if [ -d "$UPSTREAM_DIR/.git" ]; then
  echo "Atualizando exercises-dataset em modo sparse, sem images/videos..."
  git -C "$UPSTREAM_DIR" sparse-checkout init --cone >/dev/null 2>&1 || true
  git -C "$UPSTREAM_DIR" sparse-checkout set data LICENSE NOTICE.md README.md
  git -C "$UPSTREAM_DIR" pull --ff-only
else
  echo "Clonando exercises-dataset em modo sparse, sem images/videos..."
  git clone --filter=blob:none --sparse "$REPO_URL" "$UPSTREAM_DIR"
  git -C "$UPSTREAM_DIR" sparse-checkout set data LICENSE NOTICE.md README.md
fi

if [ ! -f "$UPSTREAM_DIR/data/exercises.json" ]; then
  echo "ERRO: data/exercises.json não encontrado."
  exit 1
fi

if [ ! -f "$UPSTREAM_DIR/data/exercises.schema.json" ]; then
  echo "ERRO: data/exercises.schema.json não encontrado."
  exit 1
fi

cp "$UPSTREAM_DIR/data/exercises.json" "$WORK_DIR/exercises.raw.json"
cp "$UPSTREAM_DIR/data/exercises.schema.json" "$WORK_DIR/exercises.schema.json"
cp "$UPSTREAM_DIR/LICENSE" "$WORK_DIR/LICENSE.upstream.txt"
cp "$UPSTREAM_DIR/NOTICE.md" "$WORK_DIR/NOTICE.upstream.md"

git -C "$UPSTREAM_DIR" rev-parse HEAD > "$WORK_DIR/SOURCE_SHA.txt"
cat > "$WORK_DIR/SOURCE.txt" <<EOF
source=hasaneyldrm/exercises-dataset
url=$REPO_URL
sha=$(cat "$WORK_DIR/SOURCE_SHA.txt")
policy=textual_only
media=not_downloaded_by_default_do_not_use_without_gym_visual_license
EOF

cat <<EOF
Exercises dataset sincronizado.

Fonte local:
$UPSTREAM_DIR

Dados copiados para:
$WORK_DIR

Arquivos prontos:
- exercises.raw.json
- exercises.schema.json
- SOURCE.txt
- SOURCE_SHA.txt
- LICENSE.upstream.txt
- NOTICE.upstream.md

Política atual:
- usar dados textuais
- não baixar nem servir images/videos por padrão
- não usar mídia sem licença própria da Gym visual
EOF
