#!/usr/bin/env bash
set -euo pipefail

SOURCE_REPO="${1:-}"
SOURCE_REF="${2:-}"
PROJECT_ROOT="${FITCORE_PROJECT_ROOT:-/opt/fitcore-pro}"
DEST_ROOT="${FITCORE_IMPORTED_MEDIA_DIR:-$PROJECT_ROOT/apps/site-static/media/imported}"

if [ -z "$SOURCE_REPO" ]; then
  cat <<'USAGE'
Uso:
  bash infra/scripts/import-exercise-media-from-github.sh <github-repo-url-ou-owner/repo> [branch-ou-tag]

Exemplos:
  bash infra/scripts/import-exercise-media-from-github.sh https://github.com/OWNER/REPO.git
  bash infra/scripts/import-exercise-media-from-github.sh OWNER/REPO main

O script importa arquivos .gif, .png, .jpg, .jpeg, .webp, .avif e .svg para:
  apps/site-static/media/imported/<owner-repo>/

Depois você escolhe qual arquivo vira mídia oficial do exercício e copia para:
  apps/site-static/media/exercises/<slug-do-exercicio>.gif
USAGE
  exit 64
fi

if [[ "$SOURCE_REPO" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]]; then
  SOURCE_REPO="https://github.com/${SOURCE_REPO}.git"
fi

if [[ ! "$SOURCE_REPO" =~ ^https://github.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+(.git)?/?$ ]]; then
  echo "ERRO: informe uma URL pública do GitHub no formato https://github.com/OWNER/REPO.git ou OWNER/REPO" >&2
  exit 65
fi

if ! command -v git >/dev/null 2>&1; then
  echo "ERRO: git não encontrado." >&2
  exit 66
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "ERRO: python3 não encontrado." >&2
  exit 66
fi

mkdir -p "$DEST_ROOT"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

REPO_SLUG="$(printf '%s' "$SOURCE_REPO" | sed -E 's#^https://github.com/##; s#\.git$##; s#/$##; s#[^A-Za-z0-9_.-]+#-#g')"
CLONE_DIR="$TMP_DIR/source"
DEST_DIR="$DEST_ROOT/$REPO_SLUG"

printf 'Fonte: %s\n' "$SOURCE_REPO"
printf 'Destino: %s\n' "$DEST_DIR"

if [ -n "$SOURCE_REF" ]; then
  git clone --depth 1 --branch "$SOURCE_REF" "$SOURCE_REPO" "$CLONE_DIR"
else
  git clone --depth 1 "$SOURCE_REPO" "$CLONE_DIR"
fi

rm -rf "$DEST_DIR"
mkdir -p "$DEST_DIR"

python3 - "$CLONE_DIR" "$DEST_DIR" "$SOURCE_REPO" "${SOURCE_REF:-default}" <<'PY'
import hashlib
import json
import os
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

source = Path(sys.argv[1]).resolve()
dest = Path(sys.argv[2]).resolve()
repo = sys.argv[3]
ref = sys.argv[4]
allowed = {".gif", ".png", ".jpg", ".jpeg", ".webp", ".avif", ".svg"}
skip_parts = {".git", "node_modules", "vendor", ".next", "dist", "build"}

license_files = []
for name in ["LICENSE", "LICENSE.md", "LICENSE.txt", "COPYING", "COPYING.md", "NOTICE", "NOTICE.md"]:
    p = source / name
    if p.exists() and p.is_file():
        license_files.append(name)

manifest_path = dest / "manifest.jsonl"
records = []

for path in sorted(source.rglob("*")):
    if not path.is_file():
        continue
    rel = path.relative_to(source)
    if any(part in skip_parts for part in rel.parts):
        continue
    if path.suffix.lower() not in allowed:
        continue

    target = dest / rel
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(path, target)

    data = path.read_bytes()
    records.append({
        "source_repo": repo,
        "source_ref": ref,
        "source_path": str(rel).replace(os.sep, "/"),
        "destination_path": str(target),
        "public_path": "/" + str(target.relative_to(dest.parents[1])).replace(os.sep, "/") if "apps/site-static" in str(target) else str(target),
        "extension": path.suffix.lower(),
        "bytes": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
        "license_files_found": license_files,
        "license_status": "requires_manual_review_before_commercial_use",
        "imported_at": datetime.now(timezone.utc).isoformat(),
    })

with manifest_path.open("w", encoding="utf-8") as fh:
    for record in records:
        fh.write(json.dumps(record, ensure_ascii=False) + "\n")

print(json.dumps({
    "imported_files": len(records),
    "destination": str(dest),
    "manifest": str(manifest_path),
    "license_files_found": license_files,
}, ensure_ascii=False, indent=2))
PY

echo
find "$DEST_DIR" -type f \( -iname '*.gif' -o -iname '*.png' -o -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.webp' -o -iname '*.avif' -o -iname '*.svg' \) -printf '%P\n' | head -80

echo
echo "Importação concluída. Revise licença/origem antes de publicar como mídia oficial de exercício."
echo "Manifesto: $DEST_DIR/manifest.jsonl"
