#!/usr/bin/env bash

# ============================================================
# FITCORE PRO - EXERCISES DATASET SYNC
# Clona/atualiza hasaneyldrm/exercises-dataset como fonte local.
# Não commitar o clone nem mídia no repositório FitCore Pro.
# ============================================================

set -euo pipefail

ROOT="/opt/fitcore-pro"
UPSTREAM_DIR="$ROOT/upstream/exercises-dataset"
WORK_DIR="$ROOT/storage/exercises-dataset"
REPO_URL="https://github.com/hasaneyldrm/exercises-dataset.git"

mkdir -p "$ROOT/upstream"
mkdir -p "$WORK_DIR"

if [ -d "$UPSTREAM_DIR/.git" ]; then
  echo "Atualizando exercises-dataset..."
  git -C "$UPSTREAM_DIR" pull --ff-only
else
  echo "Clonando exercises-dataset..."
  git clone "$REPO_URL" "$UPSTREAM_DIR"
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

git -C "$UPSTREAM_DIR" rev-parse HEAD > "$WORK_DIR/SOURCE_SHA.txt"
cat > "$WORK_DIR/SOURCE.txt" <<EOF
source=hasaneyldrm/exercises-dataset
url=$REPO_URL
sha=$(cat "$WORK_DIR/SOURCE_SHA.txt")
policy=textual_only
media=do_not_use_without_gym_visual_license
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

Política atual:
- usar dados textuais
- não usar images/videos sem licença própria da Gym visual
EOF
