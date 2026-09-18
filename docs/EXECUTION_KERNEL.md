# Execution Kernel Adapter — #74

FitCore adopts the same execution identity/lifecycle semantics as MarcaIA #583 without introducing a shared runtime dependency or a second backend.

The cross-product namespace is `videira.execution.v1`; every identity includes the product discriminator `fitcore` before hashing, preventing collisions with MarcaIA while preserving one contract.

The V1 package in `packages/execution-core` is pure and side-effect free. It does not execute workouts, billing, users or provider calls. Future FitCore action adapters must resolve tenant/actor server-side, apply capability/policy/idempotency, then use this contract for correlation and lifecycle.

No wger source is modified.
