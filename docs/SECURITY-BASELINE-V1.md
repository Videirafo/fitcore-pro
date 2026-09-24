# Security Baseline v1

This baseline is a release gate, not a documentation-only checklist.

## Required controls

1. Rate limiting on authentication and abuse-prone public/write surfaces.
2. No wildcard credentialed CORS; browser origins are same-origin or explicit allowlists.
3. Explicit API/database projections at trust boundaries; avoid wildcard projections that can expose future columns.
4. Input allowlists/schemas so clients cannot mass-assign privileged fields.
5. Logout/session revocation must invalidate the server-side authorization path, not only hide UI or delete a browser cookie.
6. Authentication/recovery responses must avoid user-account enumeration.
7. Tenant/resource authorization is enforced server-side and fails closed across tenants.
8. Cookie-authenticated unsafe requests require same-origin CSRF controls.
9. Outbound/network and machine-control capabilities are bounded by allowlists and cannot silently become arbitrary shell/network access.
10. Secrets/tokens/cookies are excluded from audit logs and internal errors are sanitized before public responses.

## Negative gates

A release must fail when a regression allows any of these:

- stale/revoked session accepted by a protected operation;
- hostile browser origin accepted for an unsafe authenticated request;
- wildcard CORS;
- cross-tenant resource access;
- client-supplied privilege/tenant identity trusted as authority;
- sensitive/new database columns leaking through wildcard API projections;
- distinct public signals that disclose whether an account exists;
- authentication/abuse bursts bypassing the configured limiter;
- unrestricted arbitrary network/shell capability on governed agent surfaces;
- Authorization, cookies, reset tokens, signing keys or equivalent secrets in logs/responses.

## Evidence

The repository-owned `security:check` command and normal CI gates are the minimum evidence. Production promotion still requires exact-SHA deployment, runtime health/smoke and the project's existing rollback discipline.
