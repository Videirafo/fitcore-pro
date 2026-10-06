---
name: videira-launch
description: Governed launch-intelligence workflow for turning a shipped feature or release into evidence, release notes, social copy, screenshots and an optional short launch video. Use for /videira-launch, /launch, release demo, launch video, release evidence, or when a feature is ready to show.
---

# Videira Launch Intelligence

Run this only after the feature has a valid implementation candidate. It extends the repository delivery flow; it never replaces tests, CI, security gates or deployment validation.

## Required flow

1. **Inspect** the repository, current diff/PR, README, routes and the product surface affected by the release.
2. **Verify** the normal repository gates first. Fail closed when tests/build/security/CI are red or unknown for a production release.
3. **Choose the demo mode** from `launch.config.json`: web UI, mobile UI, agent/API/MCP, CLI/infra, or mixed.
4. **Protect data**. Never expose secrets, tokens, private customer data, real inbox content, credentials or internal-only URLs. Use synthetic/demo data when required.
5. **Plan** a specific product story: hook → real product action → result → concise outro. Do not invent numbers, testimonials or capabilities.
6. **Capture the real product** whenever tools permit. Prefer actual UI/flows/components/terminal output over generic mockups.
7. **Produce evidence** by running `node scripts/launch-evidence.mjs`. Preserve exact commit SHA, branch, repository, PR/deployment inputs and recent commits.
8. **Create launch assets** under a timestamped `launch-output-YYYY-MM-DD-HHmmss/` directory:
   - `launch-plan.md`
   - `evidence.json`
   - `release-notes.md`
   - `share-copy.md`
   - `screenshots/` when visual
   - `launch.mp4` and `poster.jpg` when video materially improves the release
9. **Video rule**: default to 15–25 seconds, readable, mobile-safe and specific to this product. Use the installed /brag skill when available and appropriate; otherwise use the best local browser/video tools. Never make video a release blocker.
10. **Channel adaptation**: derive only the channels enabled in `launch.config.json`. Keep one factual master story and adapt format/copy without changing claims.
11. **Approval gate**: publishing is separate from generation. Do not publish automatically unless the repository's configured approval/publisher workflow explicitly authorizes it.
12. **Release receipt**: final output must state SHA, PR, CI state, deployment URL/status when known, artifacts created and any skipped step with reason.

## Governance

Canonical sequence:

`Issue → branch → implementation → tests → PR → CI → merge → deploy by exact SHA → smoke → evidence → launch assets → approval → publish → metrics/learning`

For preview-only work, clearly label assets as preview and do not imply production availability.

## Inspiration

This workflow is an original Videira adaptation informed by the MIT-licensed `latent-spaces/brag` project. It adds release governance, privacy gates, evidence receipts and multi-project configuration.
