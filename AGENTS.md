# AGENTS.md — Permanent Engineering Baseline

This file is the authoritative operating contract for AI agents and developers working in this repository. Read it before changing code. Project-specific instructions may extend these rules, but must not silently weaken them.

## 1. Operating model: COHI

Use the COHI composed-intelligence model: orchestrate specialist perspectives as needed (product, architecture, frontend, backend, database, security, UX/UI, motion, QA, observability, DevOps and review). High-impact decisions should be challenged from multiple lenses instead of being accepted from a single implementation agent.

Core sequence:

`INSPECT → DIAGNOSE → PLAN → ISSUE → BRANCH → IMPLEMENT → TEST → PR → REVIEW → DEPLOY → OBSERVE`

Never use `GUESS → PATCH → DEPLOY`.

If something was not verified, state `NOT VERIFIED`. Never fabricate repository state, logs, test results, deploy status, API behavior, dependencies or validation.

## 2. GitHub workflow is mandatory

Every relevant bug fix, improvement, refactor, security change, performance change, infrastructure change or new feature must have a GitHub Issue before implementation.

Before creating an Issue, inspect existing Issues to avoid duplicates. The Issue should document context, current behavior, expected behavior, acceptance criteria, risks, dependencies and required tests when applicable.

Work on a dedicated branch. Do not use direct changes to the default branch as the normal delivery flow.

Every code/documentation change must be delivered through a Pull Request. The PR description must link its Issue. Prefer closing keywords when the PR fully resolves the Issue:

- `Closes #123`
- `Fixes #123`

The PR should describe what changed, why, impact, risks, validation performed and rollback considerations. UI changes should include visual evidence when practical.

Deploys must be traceable to an approved PR. Avoid manual production changes that bypass Git history and review. Emergency changes must be documented retroactively with Issue/PR traceability as soon as possible.

Use Conventional Commits and Commitlint when supported. Typical prefixes: `feat:`, `fix:`, `refactor:`, `perf:`, `test:`, `docs:`, `chore:`, `ci:`, `build:`.

## 3. Diagnose before altering

Before any modification:

1. Inspect the current implementation, dependencies, configuration and relevant runtime/CI state.
2. Identify the root cause or explicit product requirement.
3. Define the smallest safe change.
4. Identify rollback/recovery when the change has operational risk.
5. Do not replace working architecture without evidence that replacement is necessary.

For infrastructure, production, database or deployment changes, preserve backup/rollback capability and verify the current state first.

## 4. UI states, loading and motion

Use `https://github.com/kylezantos/design-motion-principles` as the motion-design reference for creating or auditing web/app interfaces.

Motion must improve comprehension, continuity, feedback or perceived performance. Do not add animation simply for decoration.

Every asynchronous UI must explicitly consider relevant states such as:

- idle
- loading
- success
- empty
- error
- retry
- disabled
- uploading / processing / queued / syncing when applicable

Use skeletons when they preserve layout and improve perceived loading. Use lazy loading/code splitting for expensive or non-critical content when appropriate. Provide progress feedback for operations where users meaningfully wait.

Use smooth, intentional enter/exit/state transitions when they improve orientation. Avoid animation spam, hover-scale on everything, unnecessary blur entrances, excessive stagger, bouncy utility actions, long blocking animations and motion-on-mount for static content.

Respect `prefers-reduced-motion`. Prefer transform/opacity and other performance-safe techniques. Verify mobile behavior and lower-powered devices.

## 5. Observability

Production systems must be diagnosable.

Prefer OpenTelemetry as a vendor-neutral instrumentation layer when suitable. Integrate the observability backend that best fits the project, such as Sentry, Datadog or New Relic. Do not install all vendors just to satisfy a checklist.

Cover the signals appropriate to the system:

- structured logs
- exceptions/errors
- metrics
- traces/spans
- request latency
- database activity
- queues/jobs
- external integrations
- authentication/authorization failures
- frontend/backend runtime errors
- release/deploy context

Never log passwords, secrets, access tokens or unnecessary sensitive data. Errors should carry enough safe context to diagnose the failure.

## 6. Architecture contract and code quality

Maintain an explicit architecture/dependency contract for boundaries, module responsibilities, allowed dependency direction, data access rules, tenancy/security boundaries and service interfaces. Automate these constraints in CI when practical.

Use tooling according to the actual stack and value:

- **Biome** for linting/formatting where appropriate.
- **Commitlint** + Conventional Commits for commit-message quality.
- **Knip** to detect unused files, exports and dependencies in supported JS/TS projects.
- **Stryker** mutation testing where the stack supports it and the criticality justifies it.

Do not add tools solely for checklist compliance. Avoid redundant linters/formatters unless coexistence is intentional and documented.

## 7. Testing and CI quality gates

Maintain the appropriate layers of testing:

- unit tests for isolated business logic;
- integration tests for module/service/database/API boundaries;
- end-to-end tests for critical user journeys.

Use Playwright as the preferred web E2E reference when suitable. Use Codecov when useful for coverage visibility.

Coverage percentage is an indicator, not the goal. Prioritize meaningful tests for business rules, authentication, authorization, multi-tenancy, payments, data integrity, external integrations and critical workflows.

A PR should pass the quality gates applicable to the repository before merge, for example:

- typecheck
- lint / format check
- unit tests
- integration tests
- E2E tests
- build
- Knip
- architecture contract checks
- security checks
- coverage checks
- mutation testing when configured

Never claim a gate passed unless it was actually run or reported by CI.

## 8. Performance and mobile-first behavior

Consider bundle size, rendering cost, caching, lazy loading, code splitting, image optimization, API latency, database queries/indexes, N+1 risks, CPU/memory and mobile constraints. Measure before deep optimization, but do not introduce known avoidable bottlenecks.

For user-facing interfaces, validate responsive layouts, touch targets, gestures where applicable, clear HUD/navigation, accessibility and failure/loading states.

## 9. Security, data and tenancy

Preserve least privilege, secret hygiene, input validation, authorization boundaries and tenant isolation. Never trust client-provided tenant/user identifiers without server-side authorization. Avoid exposing internal errors or secrets to users.

Schema/data migrations require explicit safety consideration, compatibility and rollback/recovery planning appropriate to risk.

## 10. Definition of done

A change is not done merely because it compiles. It should be:

- traceable;
- testable;
- reviewable;
- reversible according to risk;
- observable in production when applicable;
- documented where future agents need context.

Issue records the reason. Branch isolates the work. Code implements it. Tests demonstrate behavior. PR records and reviews the change. CI enforces gates. Deployment promotes an approved revision. Observability validates production behavior.

## 11. FitCore Pro brand invariant

The official FitCore Pro identity is a product invariant. Read `docs/brand/FITCORE_OFFICIAL_BRAND.md` before changing logos, favicons, launcher icons or brand marks.

Canonical source assets live under `apps/site/public/brand/` and the primary mark is `fitcore-pro-official.svg`. Responsive/contrast variants must preserve the same symbol and geometry.

Do not replace the official brand with `FC` monograms, generic fitness symbols, arbitrary generated logos or a new palette unless the owner explicitly approves a rebrand. Product UI colors may evolve independently; brand assets may not silently drift with the UI palette.

Any intentional brand change requires its own Issue, owner approval, regression-gate update, PR/CI and deploy traceability.
