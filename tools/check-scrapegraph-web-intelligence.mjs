import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createScrapeGraphSemanticClient } from "../services/api/security/scrapegraph-semantic.mjs";
import { FITCORE_ALL_UPSTREAMS } from "../services/api/security/upstream-capabilities.mjs";

const upstream = FITCORE_ALL_UPSTREAMS.find((item) => item.id === "scrapegraphai");
assert.ok(upstream, "ScrapeGraphAI deve estar registrado");
assert.equal(upstream.pinnedVersion, "2.2.4");
assert.equal(upstream.license, "MIT");
assert.equal(upstream.adoption, "shared-loopback-service");

const disabled = createScrapeGraphSemanticClient({ FITCORE_SCRAPEGRAPH_ENABLED: "false" });
assert.equal(disabled.status().enabled, false);
assert.equal(disabled.status().loopbackOnly, true);
assert.equal(disabled.status().pinned, "2.2.4");

assert.throws(
  () => createScrapeGraphSemanticClient({ FITCORE_SCRAPEGRAPH_ENABLED: "true", FITCORE_SCRAPEGRAPH_URL: "https://example.com" }),
  /loopback_service/,
);

const source = readFileSync("services/api/security/scrapegraph-semantic.mjs", "utf8");
assert.match(source, /MAX_CONTENT_CHARS = 12_000/);
assert.match(source, /TIMEOUT_MS = 45_000/);
assert.match(source, /scrapegraph_source_mismatch/);
assert.match(source, /scrapegraph_version_mismatch/);
assert.match(source, /instruction_like_source_text_filtered/);
assert.match(source, /do not invent health or medical guidance/);

const managerSource = readFileSync("services/api/security/open-source-capabilities.mjs", "utf8");
assert.match(managerSource, /semantic_auto_apply: false/);
assert.match(managerSource, /external_content_untrusted: true/);
assert.match(managerSource, /semantic_status/);

const docs = readFileSync("infra/scrapegraph/README.md", "utf8");
assert.match(docs, /127\.0\.0\.1:11236/);
assert.match(docs, /MarcaIA/);
console.log("FitCore ScrapeGraphAI web intelligence: OK");
