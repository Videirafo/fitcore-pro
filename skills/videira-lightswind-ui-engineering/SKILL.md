# VIDEIRA LIGHTSWIND UI ENGINEERING — SOURCE-FIRST DESIGN, CLI & AI CREATION SKILL

## Mission

Use Lightswind UI as a controlled source of UI components, interaction patterns and AI-assisted design intelligence across **MarcaIA** and **FitCore Pro**.

This skill does **not** authorize a wholesale redesign, a second frontend, a second design system, or blind installation of every Lightswind component. It exists to make both products visually stronger while preserving their canonical architecture, brand language, performance budgets and operational UX.

Canonical principle:

> **Adopt patterns and source code selectively. Preserve product identity, tokens, contracts and user workflows.**

## Provenance and audit snapshot — 2026-09-09

Source audited: `codewithMUHILAN/Lightswind-UI-Library` and the published `lightswind` npm package.

Observed facts:
- public React component library with a source-first delivery model;
- supports React 18/19, Tailwind CSS 3/4 and Next.js/Vite/Remix/CRA;
- CLI can initialize projects, list components and copy selected component source into the application;
- MCP server exposes component discovery/documentation/install capabilities to AI coding agents;
- component catalog includes UI core, form controls, navigation, animated backgrounds, text effects, advanced components and WebGL/3D elements;
- repository license is MIT for the public code;
- Lightswind Pro is a separate commercial offering for premium components/blocks and authenticated CLI/MCP delivery;
- npm `latest` observed on 2026-09-09 was `3.2.4`;
- GitHub repository/release metadata observed during the same audit still exposed `3.2.2` in some places. Treat version bumps as a supply-chain review event rather than automatically following `latest`.

## License policy

### Public/free content
Public repository code under MIT may be used commercially if the MIT notice/conditions are respected where legally required.

### Pro content
Never assume a public MIT repository grants rights to premium/proprietary blocks fetched behind Lightswind Pro authentication.

Rules:
- do not commit `LIGHTSWIND_LICENSE_KEY` or any Pro key;
- do not copy Pro code into MarcaIA or FitCore unless the account/license permits the intended commercial use;
- do not redistribute paid blocks outside the license terms;
- if provenance is unclear, treat the component as unavailable until reviewed;
- preserve a short source/provenance note for externally sourced components when practical.

## Source-first architecture

Lightswind components must become **local project source**, then be adapted to the product. Do not build product code around a runtime import such as `import { Button } from "lightswind"`.

Preferred flow:

`catalog discovery -> component candidate -> license check -> local source import -> token adaptation -> accessibility/performance review -> product-specific API -> tests -> visual review`

The imported source is a starting point, not a permanent upstream contract.

## Guarded CLI policy

Both projects use a repository-owned wrapper pinned to a reviewed Lightswind CLI version.

Current pin: `3.2.4`.

The wrapper intentionally blocks `lightswind init` because both applications already have architecture, tokens and UI conventions. A generic initializer is allowed only after a deliberate design-system migration review.

Allowed normal commands:

```bash
npm run ui:lightswind:doctor
npm run ui:lightswind:list
npm run ui:lightswind -- add <component>
npm run ui:lightswind -- add-category <category>
npm run ui:lightswind -- auth-status
npm run ui:lightswind -- mcp
```

`mcp-init` changes editor configuration and therefore requires explicit opt-in:

```bash
LIGHTSWIND_ALLOW_MCP_INIT=1 npm run ui:lightswind -- mcp-init
```

Never use `@latest` in CI or automated code-generation pipelines. Version changes require a small audit of changelog, package provenance, transitive dependencies and generated diffs.

## AI/MCP creation policy

AI agents may use Lightswind MCP for discovery and source retrieval, but must follow this order:

1. understand the product screen and user job;
2. inspect existing project components/tokens;
3. search Lightswind by **use case**, not visual novelty;
4. compare at least one native/existing implementation against the candidate;
5. install only the smallest required component set;
6. adapt copied source to project tokens and language;
7. remove unused effects/dependencies;
8. run accessibility, mobile and performance checks;
9. submit through the repository's normal Issue/branch/PR gates.

Agents must never treat MCP output as trusted production code without review.

## Design-system rule

Lightswind is a **component source and pattern catalog**, not the owner of product tokens.

Priority order:

`project design tokens -> project primitives -> adapted Lightswind source -> external defaults`

If a copied component introduces its own colors, radii, shadows, typography or motion vocabulary, map them to the project before shipping.

Do not let `lightswind.config.json` or generated defaults redefine the global brand without an explicit ADR/design migration.

## MarcaIA application

### Product identity to preserve
MarcaIA already has its own operational shell, premium marketing language, responsive navigation and Tailwind v4 theme tokens. Lightswind must enhance those surfaces, not replace them.

Canonical UX rule remains:

> **Backend fala engenharia. Produto fala negócio. Cliente vê resultado, contexto e próxima ação.**

### High-value candidates
Use selectively for:
- `dialog`, `drawer`, `sheet`, `popover`, `tooltip` — dense operational workflows;
- `table`, `tabs`, `pagination`, `scroll-area`, `resizable` — CRM, billing, automations and admin surfaces;
- `progress`, `skeleton`, `toast`, `badge` — async state and system feedback;
- `chart` — analytics/revenue dashboards after numeric data is computed deterministically;
- `bento-grid`, `magic-card`, `glowing-cards`, `count-up` — marketing/overview surfaces where they improve scanning;
- `ai-prompt`, `terminal-card`, `connection-graph` — Hermes/Page Agent/Automation demonstrations, only when the business meaning remains clear;
- `grid-dot-backgrounds`, subtle gradients or beams — marketing surfaces only, adapted to MarcaIA tokens.

### Default rejection list for operational screens
Avoid by default:
- custom cursors;
- continuous particle systems;
- shader backgrounds;
- 3D globes/carousels;
- animation-heavy navigation;
- effects that obscure tables, forms, appointments, billing or customer conversations.

3D/WebGL is marketing/demo-only unless a concrete product job justifies it.

### MarcaIA performance gate
For `/app/*` routes:
- no WebGL dependency by default;
- no continuous animation needed to understand state;
- respect `prefers-reduced-motion`;
- dynamically import heavy visual modules;
- do not regress Core Web Vitals or interaction latency for decorative value;
- preserve 320px minimum layout support and touch-safe navigation.

## FitCore Pro application

### Product identity
FitCore is mobile-first fitness software. The highest-value UI is fast logging, clear progress, readable plans and low-friction trainer/student workflows.

### Priority candidates
- `card`, `badge`, `avatar` — exercise/student/trainer summaries;
- `progress`, `count-up` — completion, streaks, volume and goal progress;
- `tabs`, `accordion`, `collapsible` — workout/day/exercise organization;
- `drawer`, `sheet`, `dialog` — mobile editing and quick actions;
- `calendar` — programming and attendance where date selection is needed;
- `chart` — volume, PR, adherence and body metrics;
- `skeleton`, `toast`, `alert` — sync/loading/error states;
- `drag-order-list` — exercise ordering only if touch behavior and accessibility are validated;
- restrained confetti/celebration only after meaningful milestones, never on every action.

### FitCore prerequisite
The current Next site must have a canonical Tailwind/design-token foundation before Lightswind source is imported. The guarded CLI doctor intentionally reports incompatible until Tailwind is configured in the target app.

Do not run a generic Lightswind initializer to solve that prerequisite. Establish Tailwind deliberately inside the FitCore architecture first, then import components selectively.

### Fitness-specific mobile rules
- minimum practical touch target: 44x44 CSS px;
- one-handed use for active workout flows;
- avoid modal chains during set logging;
- preserve local optimistic feedback where safe;
- large numbers for reps/load/time;
- high contrast under bright gym lighting;
- animations must not block rapid consecutive entries;
- critical workout data stays usable on slow/intermittent networks.

## Accessibility requirements

Every imported component is re-audited in context.

Required:
- semantic HTML and correct roles;
- complete keyboard path on desktop;
- visible focus state;
- accessible names for icon-only controls;
- proper dialog focus management;
- contrast appropriate to normal/disabled/error states;
- no information conveyed only by color;
- `prefers-reduced-motion` handling;
- touch targets and spacing suitable for mobile;
- charts must expose textual summaries or tabular alternatives for key values.

“Accessible in the upstream catalog” is not proof that the adapted implementation remains accessible.

## Performance and dependency policy

Source-first does not mean dependency-free. Individual components can bring Framer Motion, GSAP, Three.js, charting or other packages.

Before importing a component:
1. inspect its dependencies;
2. check whether the project already has an equivalent capability;
3. estimate client bundle/runtime cost;
4. reject duplicate animation/chart/3D stacks unless the value is material;
5. lazy-load heavy modules;
6. delete unused code from copied components.

Operational UI should favor CSS transitions and small primitives over animation frameworks when both satisfy the job.

## Component promotion model

Imported source goes through four states:

### L0 — Candidate
Catalog reference only. No project code.

### L1 — Sandbox
Copied into a feature branch for evaluation. Not reused globally.

### L2 — Product component
Adapted to tokens, tested, accessible and used on a real screen.

### L3 — Design-system primitive
Promoted only after repeated use across multiple screens with a stable API and regression coverage.

Do not promote a flashy one-off component to global primitive prematurely.

## Review scorecard

Score each candidate 0–2 on:
- user-job improvement;
- visual consistency;
- mobile ergonomics;
- accessibility;
- bundle/runtime cost;
- maintenance cost;
- reuse potential.

Adopt normally only when the total value is positive and there is no simpler existing component that does the job equally well.

## Security and secrets

- Pro license keys belong in local secret stores or CI secret bindings;
- never expose the key in client bundles;
- never log authentication material;
- do not permit an AI agent to read unrelated secrets merely to run the component catalog;
- generated source must be reviewed for network calls, unsafe HTML, remote asset loading and dependency additions;
- no component may introduce tenant data leakage or bypass application authorization boundaries.

## Anti-patterns

Reject:
- importing all components/categories “for future use”;
- running `lightswind init` on an established project without review;
- using `@latest` in CI;
- committing Pro keys;
- using upstream visual defaults as the new brand;
- duplicating shadcn/existing primitives with near-identical Lightswind copies;
- adding WebGL/Three/GSAP only because a component looks impressive;
- turning CRM, agenda, billing or workout logging into animation showcases;
- direct `lightswind` runtime imports when local source is the intended architecture;
- letting an agent auto-install components without reviewing the diff and dependencies.

## Standard implementation workflow

### 1. Audit existing screen
Identify user job, current primitives, mobile layout, data/loading/error states and existing regressions.

### 2. Discover
Use `ui:lightswind:list` or MCP search for a small candidate set.

### 3. License/dependency gate
Confirm free/Pro status and inspect dependencies.

### 4. Import locally
Use the guarded CLI `add` command, never bulk-init the project.

### 5. Normalize
Rename/adapt props if needed, map tokens, remove unused effects and use project utilities.

### 6. Integrate
Connect to canonical product data/actions. Never let UI components become a second business-logic layer.

### 7. Validate
Run project tests, typecheck/lint/build, focused accessibility checks and mobile review.

### 8. Measure
Check perceived speed, bundle impact and whether the component actually improves task completion.

### 9. Promote or remove
Keep a good local component, promote repeated stable primitives, or delete failed experiments completely.

## Repository gates

### MarcaIA
`Issue -> branch -> PR -> MarcaIA CI -> migration/promoter if applicable -> VPS when applicable -> real smoke -> merge/deploy by SHA`

### FitCore Pro
`Issue -> branch -> PR -> project checks -> Next build -> mobile/UX smoke -> merge`

## Initial roadmap

### MarcaIA P1
1. feedback primitives: toast/skeleton/progress;
2. CRM/billing tables and drawers;
3. Automation/Hermes visualization primitives;
4. analytics cards/charts;
5. marketing-only ambient backgrounds and bento sections.

### FitCore P1
1. Tailwind/design-token foundation in `apps/site`;
2. cards/badges/progress for workout and student state;
3. mobile drawer/sheet for fast editing;
4. tabs/accordion for workout structure;
5. charts for real progress metrics;
6. restrained milestone celebration.

## Definition of done

A Lightswind-derived improvement is done only when:
- it solves a real product job;
- source and license are known;
- code is local and understandable;
- project tokens/brand are preserved;
- mobile and accessibility behavior are verified;
- dependencies are justified;
- tests/build pass;
- no secret or Pro entitlement is leaked;
- no existing canonical subsystem was duplicated.
