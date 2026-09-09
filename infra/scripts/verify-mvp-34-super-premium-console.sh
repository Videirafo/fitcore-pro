#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$0")/../.."
echo "=== MVP-34 Super Premium Console ==="
npm run check:project
npm run mvp32:check
npm run mvp33:check
npm run mvp33:test
npm run mvp34:check
npm run site:next:check
node --check services/api/security/evidence-coach.mjs
node --check services/api/server.mjs
npm run site:next:build
git diff --check
echo "OK: MVP-34 gates concluídos."
