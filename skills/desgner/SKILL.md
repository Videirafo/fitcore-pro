---
name: desgner
description: Mandatory visual design governance for MarcaIA and reusable product projects. Forces DESIGN.md-first implementation, semantic tokens, reference locking, anti-generic-AI rules and visual QA.
version: 1.0.0
---

# DESGNER

## Mission

Prevent generic, inconsistent AI-generated interfaces by converting visual intent into a versioned engineering contract.

Canonical flow:

**Product brief -> visual reference -> DESIGN.md -> Reference Lock -> implementation -> visual QA -> accessibility QA -> evidence**

`DESIGN.md` is the visual source of truth. This skill governs how agents apply it.

## Mandatory preflight

Before creating/editing/reviewing UI:

1. Read this skill.
2. Read root `DESIGN.md`.
3. Read any brand/theme document referenced there.
4. Inspect the current implementation and existing primitives.
5. Create a compact Reference Lock.
6. Only then edit UI.

### Fail closed

If `DESIGN.md` is missing, materially incomplete or conflicts with the product, do not invent styling in code. First repair/document the design system and mark unknown decisions as OPEN.

## Reference Lock

Record for each material UI task:

- Product/screen/flow;
- user job;
- primary visual direction;
- traits to preserve;
- secondary details borrowed;
- typography roles;
- color-role commitments;
- density;
- surface/elevation rules;
- image/media strategy;
- interaction personality;
- explicit rejects;
- open decisions.

Implementation must stay inside this lock. If it needs to change, update the lock first.

## Reference research

When research tooling is available:

- search several relevant directions;
- include an aesthetic direction, a domain/product direction and a strong real-product direction;
- prefer real product references over generic templates;
- select one primary foundation;
- borrow at most 1-2 named details from secondary references;
- never average strong references into a bland generic middle;
- preserve source token/component roles;
- never copy logos, claims, proprietary assets or brand identity.

## Semantic design rules

Agents must use semantic tokens rather than arbitrary raw values.

Good: project token, CSS custom property, approved variant.

Bad by default: hardcoded hex in feature files, arbitrary Tailwind color/radius/shadow, inline visual constants, unexplained gradients.

If a genuinely new value is required:

1. define its semantic role;
2. document it in `DESIGN.md`;
3. add/update theme token;
4. use the token.

## Component policy

Before creating a primitive:

1. search project primitives;
2. search feature-local components;
3. reuse or extend;
4. create a new primitive only when a real reusable pattern exists.

Do not create near-duplicate buttons, cards, dialogs, inputs or navigation elements.

## Product vs marketing

### Operational product UI

Prioritize task completion, stable navigation, scanability, data density, predictable states, accessible controls, mobile ergonomics and low decoration.

### Marketing/public UI

May use more expressive typography, imagery, motion, glow, editorial rhythm and conversion-oriented composition when permitted by `DESIGN.md`.

Never transfer marketing effects into operational screens by reflex.

## Required states

Interactive components must intentionally handle relevant states: default, hover, focus-visible, active/pressed, selected, disabled, loading, empty, success, warning, error and retry/offline/permission states when applicable.

## Anti-AI rule

Reject visual choices made only because they are common in AI-generated websites. See `references/anti-ai-patterns.md`.

Common warning signs:

- generic purple/blue gradients;
- gradient hero words;
- universal glass cards;
- giant radius everywhere;
- excessive pills;
- repeated icon/title/copy cards;
- centered SaaS hero autopilot;
- meaningless blobs/glow;
- fake proof;
- generic copy;
- animation without state meaning.

Any of these may be used only when project design intent explicitly justifies them.

## Responsive/mobile

Do not simply stack desktop blocks. Define information priority, collapse/hide behavior, touch targets, mobile navigation, table/chart fallback and safe-area behavior.

## Accessibility

Required in context:

- semantic HTML/roles;
- keyboard path;
- visible focus;
- accessible names;
- form labels/errors;
- contrast;
- non-color state cues;
- reduced motion;
- touch-safe targets.

## External component sources

Priority:

`project tokens -> project primitives -> adapted external source -> external defaults`

Imported/reference components must be normalized to project tokens, accessibility, performance and product language before shipping.

## Visual QA gate

A material UI task is not done until:

- `DESIGN.md` compliance checked;
- Reference Lock checked;
- token drift checked;
- mobile/desktop behavior checked;
- states checked;
- accessibility checked;
- product-specific content checked;
- Design Guard run;
- evidence recorded.

Use `references/visual-qa.md`.

## Evidence

For substantial visual changes record changed files, screenshots/visual verification when tooling permits, responsive widths, Design Guard result, lint/typecheck/tests/build results as applicable, and known deviations.

Never claim pixel-perfect or visually verified without visual evidence.

## Definition of done

**DESIGN.md read -> Reference Lock -> semantic implementation -> reuse check -> responsive states -> accessibility -> Design Guard -> visual QA -> evidence.**