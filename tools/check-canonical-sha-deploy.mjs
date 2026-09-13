import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const path = new URL("../infra/scripts/deploy-fitcore-by-sha.sh", import.meta.url);
const script = await readFile(path, "utf8");

assert.match(script, /merge-base --is-ancestor "\$EXPECTED_SHA" origin\/main/);
assert.match(script, /worktree add --detach "\$RELEASE_DIR" "\$EXPECTED_SHA"/);
assert.match(script, /npm run check:project/);
assert.match(script, /npm run mvp32:check/);
assert.match(script, /npm run all:ui-gates/);
assert.match(script, /npm run site:next:build/);
assert.match(script, /install -m 0700 infra\/scripts\/fitcore-api-with-hermes\.sh "\$WRAPPER"/);
assert.match(script, /trap rollback ERR/);
assert.match(script, /FITCORE_RELEASE_SHA=\$EXPECTED_SHA/);
assert.match(script, /curl -fsS --max-time 8 "\$PUBLIC_URL\/api\/health"/);
assert.match(script, /api\/mvp-32\/status/);
assert.doesNotMatch(script, /FITCORE_DATABASE_URL=.*postgresql:/);

console.log("OK: deploy canônico por SHA, rollback e smoke público validados.");
