// FITCORE PRO — Open-source capability registry (#14)
// First-party metadata only. Upstream code is not loaded into the API runtime.

export const FITCORE_UPSTREAM_CAPABILITIES = Object.freeze([
  Object.freeze({
    id: "stirling-pdf",
    repository: "Stirling-Tools/Stirling-PDF",
    pinnedVersion: "2.14.3",
    license: "MIT-core-with-restricted-directories",
    purpose: "document-processing",
    adoption: "isolated-loopback-service",
  }),
  Object.freeze({
    id: "crawl4ai",
    repository: "unclecode/crawl4ai",
    pinnedVersion: "0.9.3",
    license: "Apache-2.0-plus-upstream-attribution-requirement",
    purpose: "curated-web-knowledge",
    adoption: "isolated-loopback-service",
  }),
  Object.freeze({
    id: "scrapegraphai",
    repository: "ScrapeGraphAI/Scrapegraph-ai",
    pinnedVersion: "2.2.4",
    license: "MIT",
    purpose: "semantic-web-knowledge-extraction",
    adoption: "shared-loopback-service",
  }),
  Object.freeze({
    id: "openhands",
    repository: "OpenHands/OpenHands",
    pinnedVersion: "architecture-reference-2026-09-10",
    license: "MIT",
    purpose: "agent-runtime-boundaries",
    adoption: "pattern-only",
  }),
]);

export const FITCORE_UPSTREAM_REFERENCES = Object.freeze([
  Object.freeze({
    id: "agency-agents",
    repository: "msitarzewski/agency-agents",
    pinnedVersion: "curated-reference-2026-09-10",
    license: "MIT",
    purpose: "specialist-runbooks-and-handoffs",
    adoption: "curated-patterns",
  }),
  Object.freeze({
    id: "awesome-n8n-templates",
    repository: "enescingoz/awesome-n8n-templates",
    pinnedVersion: "catalog-reference-2026-09-10",
    license: "CC-BY-4.0-collection-template-provenance-required",
    purpose: "automation-patterns",
    adoption: "concept-only",
  }),
  Object.freeze({
    id: "thefuck",
    repository: "nvbn/thefuck",
    pinnedVersion: "master-reference-2026-09-10",
    license: "MIT",
    purpose: "command-correction-ux",
    adoption: "safe-suggestion-pattern",
  }),
]);
export const FITCORE_ALL_UPSTREAMS = Object.freeze([
  ...FITCORE_UPSTREAM_CAPABILITIES,
  ...FITCORE_UPSTREAM_REFERENCES,
]);

export function getFitCoreUpstream(id) {
  return FITCORE_ALL_UPSTREAMS.find((item) => item.id === id) || null;
}

export function publicFitCoreCapabilityStatus() {
  return FITCORE_ALL_UPSTREAMS.map(({ id, repository, pinnedVersion, license, purpose, adoption }) => ({
    id,
    repository,
    pinnedVersion,
    license,
    purpose,
    adoption,
  }));
}
