# VIDEIRA UI/UX PRO MAX — FitCore Pro adoption

Status: canonical design-intelligence reference for FitCore Pro UI work.

Source audited: `nextlevelbuilder/ui-ux-pro-max-skill` (2026-09-12).

## Purpose

Use UI/UX Pro Max as a **design reasoning, style-selection and review source** for web and mobile. It does not replace FitCore's official brand, product shell, existing CSS/tokens, business flows, or data contracts.

Priority order:

`FitCore brand invariant -> product/user-flow rules -> existing FitCore primitives -> this design intelligence -> external defaults`

The official logo artwork remains untouched and follows `docs/brand/FITCORE_OFFICIAL_BRAND.md`.

## License and provenance

- upstream repository root: MIT;
- some nested skills/files have their own license terms, so exact-file provenance must be checked before copying substantial source;
- prefer independent implementation of design guidance rather than vendoring the upstream dataset/skill tree;
- do not import branding, premium/commercial assets or prompts whose rights are unclear.

## Local workflow aliases

These are local FitCore aliases, not claims about upstream command names.

### `/Ui Design Styles`

Use to compare style directions for a specific surface.

FitCore selection criteria:
- gym-floor readability;
- one-handed mobile ergonomics;
- fast logging and low cognitive load;
- clear numeric hierarchy for reps/load/time/progress;
- dark/light contrast under real-world lighting;
- continuity between public site, manager console and mobile training experience.

### `/Editorial Design`

Use selectively for public marketing, launch storytelling, feature explanation and case-study style content.

FitCore editorial traits:
- bold athletic typography;
- controlled asymmetry;
- strong imagery/product-preview hierarchy;
- data/progress visuals used as evidence;
- concise labels and punchy section transitions;
- premium dark base with official functional green/violet accents;
- no decorative treatment that harms task speed.

Operational workout screens should not become magazine layouts.

### `/Uiux.build`

Use after a direction is selected.

Sequence:

`inspect -> user job -> information hierarchy -> component/state map -> responsive/touch -> accessibility -> performance -> motion -> implementation -> visual QA -> E2E -> CI`

## FitCore product profiles

### Public marketing

Target: premium fitness technology with credible product evidence.

Recommended style families:
- dark premium SaaS;
- athletic editorial;
- high-contrast product showcase;
- restrained glass/depth;
- dynamic motion used only around marketing/product demonstration.

Avoid:
- generic crypto/neon aesthetics;
- heavy particle fields behind readable copy;
- logo glow/recolor/container changes;
- fake transformation claims or fake metrics;
- visual effects that compete with CTA and product preview.

### Manager/coach console

Target: operational clarity and fast decision making.

Rules:
- dense but breathable dashboard structure;
- status hierarchy must be obvious without relying on color alone;
- charts need labels/tooltips/textual summaries;
- long student/exercise names must wrap or truncate accessibly;
- loading/empty/error/success/retry states are explicit;
- tables/cards should preserve touch and keyboard paths.

### Mobile workout execution

Target: fast, one-handed gym-floor interaction.

Rules:
- practical touch target >=44x44 CSS px;
- primary workout actions reachable without deep modal chains;
- large numbers for reps/load/time;
- optimistic feedback only where data integrity permits;
- offline/slow-network state must remain understandable;
- animation cannot block rapid set entry;
- safe areas, keyboard, back behavior and gesture conflicts are reviewed.

## Design dials for FitCore

Use as heuristics when translating upstream recommendations.

### Marketing/home
- variance: 7/10
- motion: 6/10
- density: 4/10

### Manager console
- variance: 3/10
- motion: 2/10
- density: 7/10

### Workout execution mobile
- variance: 2/10
- motion: 2/10
- density: 6/10

### Coach/AI explanation surfaces
- variance: 5/10
- motion: 4/10
- density: 5/10

## Current Flowstate-inspired hero adaptation

For Issue #59 / PR #60:
- Flowstate is used as a motion-quality reference only;
- FitCore keeps its dark athletic palette and official artwork;
- reactive WebGL is confined to the public hero;
- pointer/touch influence never captures the interaction layer;
- copy is protected by a dark scrim and remains dominant;
- `prefers-reduced-motion` freezes/de-emphasizes continuous motion;
- manager console and workout routes remain unchanged.

## Accessibility baseline

- normal text contrast target 4.5:1 where applicable;
- visible keyboard focus;
- icon-only actions have accessible names;
- state is never encoded by color alone;
- text scaling/zoom does not clip critical information;
- touch does not depend on hover;
- motion respects user preference;
- charts expose readable values beyond visual marks.

## Performance baseline

- no new design runtime merely for style selection;
- isolate/lazy-load expensive visuals;
- pause continuous work when offscreen;
- no continuous WebGL on operational or workout routes by default;
- avoid duplicate motion/charting stacks;
- evaluate client bundle/runtime cost before promoting a visual dependency.

## Review checklist

Every substantial UI PR should answer:
1. Which FitCore user job becomes faster or clearer?
2. Is the official brand invariant preserved?
3. Which existing components/tokens were reused?
4. Which design style was selected and why?
5. Which anti-patterns were explicitly rejected?
6. Does mobile work at 360/390px and with touch?
7. Are loading/empty/error/success states correct?
8. Is accessibility preserved for keyboard, labels and contrast?
9. Does motion add comprehension rather than delay?
10. Did `brand:check`, relevant UI gates, E2E/build and visual review pass?
