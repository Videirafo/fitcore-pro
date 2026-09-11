# ScrapeGraphAI Web Intelligence — FitCore Pro (#40)

## Decision

Adopt `ScrapeGraphAI/Scrapegraph-ai` `2.2.4` (MIT) as an optional semantic extraction layer behind the existing Web Knowledge capability. FitCore does not vendor or run a duplicate ScrapeGraphAI service; it consumes the canonical MarcaIA loopback sidecar.

## Flow

`HTTPS/domain allowlist -> Crawl4AI -> bounded normalized text -> shared ScrapeGraphAI loopback -> schema + injection filter -> review-required semantic JSON -> evidence-first Coach/RAG`.

## Safety

- only `gestor` and `professor` may request web knowledge preview;
- student personal data must never be scraped;
- the semantic sidecar receives text, not arbitrary target URLs;
- external content is untrusted data and cannot grant tools or permissions;
- semantic output has no auto-apply path;
- health/medical guidance must not be invented or promoted automatically;
- token, endpoint and feature flag stay server-side;
- semantic errors are fail-soft and never remove the raw reviewed Crawl4AI source.

## Runtime

`FITCORE_SCRAPEGRAPH_ENABLED=false` remains the default. The adapter requires loopback HTTP, a >=24-character server token, pinned upstream version `2.2.4`, a 12k-character semantic window and a 45-second deadline.

The shared production sidecar is hardened and smoke-tested in MarcaIA. FitCore only enables its flag after that canonical service is healthy.
