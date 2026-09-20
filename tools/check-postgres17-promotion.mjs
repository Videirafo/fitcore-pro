import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const compose = await readFile(new URL("../infra/docker/fitcore-postgres.compose.yml", import.meta.url), "utf8");
const script = await readFile(new URL("../infra/scripts/promote-fitcore-postgres-17-6.sh", import.meta.url), "utf8");

assert.match(compose, /image: postgres:17\.6-alpine/);
assert.match(compose, /127\.0\.0\.1:55435:5432/);
assert.match(compose, /fitcore-postgres17-data:\/var\/lib\/postgresql\/data/);
assert.match(compose, /fitcore-postgres17-data:/);
assert.doesNotMatch(compose, /fitcore-postgres-data:\/var\/lib\/postgresql\/data/);

assert.match(script, /systemctl stop "\$API_SERVICE"/);
assert.match(script, /pg_dump .* -Fc/);
assert.match(script, /pg_restore .*--clean --if-exists --no-owner --exit-on-error/s);
assert.match(script, /OLD_VOLUME="docker_fitcore-postgres-data"/);
assert.match(script, /NEW_VOLUME="docker_fitcore-postgres17-data"/);
assert.match(script, /wait_postgres17_stable\(\)/);
assert.match(script, /State\.Health.*Status/s);
assert.match(script, /health.*healthy/s);
assert.match(script, /sleep 2/);
assert.match(script, /NEW_VERSION="\$\(wait_postgres17_stable 160\)"/);
assert.match(script, /NEW_VERSION.*17\.6/s);
assert.match(script, /trap - ERR/);
assert.match(script, /\[\[ "\$NEW_COUNTS" == "\$OLD_COUNTS" \]\]/);
assert.match(script, /rollback\(\)/);
assert.doesNotMatch(script, /docker volume rm|down -v/);

console.log("PostgreSQL 17.6 promotion contract: OK");
