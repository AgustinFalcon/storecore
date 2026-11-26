# PCC-008D durable occurrence claim contract review — 2026-11-25

## Scope

This gate closes the exact SDD contract for durable reminder occurrence claiming without activating a runner or creating a notification effect. It specifies bounded pages, durable no-backfill cutoffs, leases, owner-plus-attempt fencing, backoff, crash recovery, database state invariants and restricted mutation privileges.

## Initial independent findings

Two independent GPT-6.1 Sol reviewers at medium reasoning returned `NO-GO` on the first draft. Their P2 findings were:

- a lease could be returned already expired after a long lock wait;
- corrupt/unknown switch data had contradictory rollback and skip outcomes;
- the third-attempt terminal precedence was ambiguous;
- settlement did not require a temporally valid lease;
- latest resume was not ordered by authoritative aggregate revision;
- a non-empty fully terminalized page had no unambiguous result shape;
- database column/state/transition and `SECURITY DEFINER` constraints were not exact enough.

## Repairs

The reviewed contract now:

- separates early eligibility `observedAt` from post-lock `leaseGrantedAt`, so waits never alter due-ness and never create an already-expired lease;
- treats corrupt or `UNKNOWN` persisted data as whole-page `CORRUPT` with transaction rollback;
- gives expired third-attempt exhaustion first terminal precedence;
- requires `lease_started_at <= settledAt < lease_until` plus owner and attempt in the mutation predicate;
- selects latest applied resume by greatest decoded `after.revision`, using that receipt's recorded instant only as the cutoff;
- distinguishes `EMPTY` from a non-empty `PAGE` that may contain zero leased records;
- defines exact columns, per-state metadata, legal transitions, terminal reasons, failure classes and runtime/migrator privileges;
- requires adversarial lock, boundary, concurrency, fencing, corruption and privilege tests.

## Final review result

- GPT-6.1 Sol architecture/domain review, medium reasoning: `APPROVE`, no P0–P3 findings.
- GPT-6.1 Sol PostgreSQL/security/concurrency review, medium reasoning: `APPROVE`, no P0–P3 findings.

Both approvals are limited to the PCC-008D contract. Migration, implementation and adversarial tests remain unapproved until their separate implementation review and local gates complete.

## Activation boundary

PCC-008D remains inactive. It adds no route, timer, scheduler, notification insert, email or external call. PCC-008E owns atomic in-app handoff; PCC-008F alone may wire an invoker after all preceding gates pass.
