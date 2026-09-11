# FitCore → ScrapeGraphAI semantic sidecar

FitCore reuses the canonical ScrapeGraphAI service managed by MarcaIA. There is **no second Python service, scheduler, database or scraper** inside FitCore.

Runtime contract:

- loopback endpoint: `http://127.0.0.1:11236`;
- upstream package baseline: `scrapegraphai==2.2.4` (MIT);
- local Ollama provider on the shared VPS;
- the sidecar receives bounded text already collected from an allowlisted Crawl4AI source;
- the sidecar cannot browse arbitrary URLs on behalf of FitCore;
- semantic output is schema-bounded, prompt-injection filtered and review-first;
- failures are fail-soft: raw curated web preview remains available;
- no student personal data is sent to web scraping;
- semantic extraction cannot auto-apply health/medical guidance.

Configure only the FitCore adapter variables:

```bash
FITCORE_SCRAPEGRAPH_ENABLED=false
FITCORE_SCRAPEGRAPH_URL=http://127.0.0.1:11236
FITCORE_SCRAPEGRAPH_TOKEN=<same server-side token used by the canonical sidecar>
```

Installation, version pinning, systemd hardening and the real benign/adversarial smoke live in the canonical MarcaIA `ops/scrapegraph` implementation.
