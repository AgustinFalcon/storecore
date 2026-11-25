# PCC-008C bounded SYSTEM lifecycle implementation evidence — 2026-11-25

## Scope and activation boundary

This cut implements closed internal candidate selection, deterministic SYSTEM lifecycle advancement and bounded cycle accounting. It does not register the cycle service as a Spring bean and adds no controller route, timer, scheduler, background executor, reminder occurrence claim, notification insert, email or external effect. Reminder readiness remains `UNAVAILABLE`; PCC-008F retains the activation decision.

## Test-first implementation

The initial focused test compile failed because `CalendarSystemCandidate`, bounded batch size, closed selection/advance/disposition/cycle results and the cycle service did not exist. The implementation then added:

- a private-factory candidate that retains the validated observed event and derives operation, revision and boundary;
- batch size 1..100 with default 50;
- closed selection, advance, receipt-disposition and cycle-result types;
- one whole-second cycle instant captured before persistence;
- exact exhaustive accounting for applied, replayed, revision conflict, invalid transition, revision exhaustion, missing and corrupt outcomes;
- PostgreSQL selection with exact eligibility, completion precedence, stable ordering, hard limit and exact exhausted-identity suppression;
- replay lookup before current state plus repeat lookup after the advisory lock;
- event revision CAS evaluated at the captured cycle instant.

## Review defects and repairs

Both independent implementation reviewers initially returned `NO-GO` because corrupted persisted content could escape the closed result and abort a partially processed cycle. They also rejected a fake early-boundary unit test because it did not exercise an actual blocked query.

The implementation was corrected to:

- validate snapshots in a materialized CTE before timestamp casts and surface invalid rows as `CORRUPT_SELECTION`;
- decode current SYSTEM event snapshots and historical replay receipts through closed `CORRUPT` results without hiding infrastructure query failures;
- run a PostgreSQL regression where `ACCESS EXCLUSIVE` blocks selection, the clock crosses the start boundary, the early captured cycle selects/writes nothing, and only the following due cycle applies;
- use temporary shadow tables to prove corrupt selection and corrupt replay fail closed without a new effect.

Final GPT-6.1 Sol architecture review at medium reasoning: `APPROVE`, no P0–P3 findings. Final GPT-6.1 Sol security/concurrency review at medium reasoning: `APPROVE`, no P0–P3 findings.

## Adversarial coverage

- exact start and end boundaries;
- completion before activation at the same boundary;
- a fully missed scheduled window completes without synthetic activation;
- stable cap and ordering;
- concurrent advance applies once and the exact loser replays;
- concurrent lifecycle revision change records revision conflict;
- replay after applied completion and later time change;
- revision exhaustion is audited once and no longer starves a size-one page;
- real database lock crossing the boundary cannot promote an early cycle;
- corrupted selection/replay data remains non-actionable;
- no automatic cycle bean or `@Scheduled` method;
- no SYSTEM notification effect.

## Local verification

- Focused domain/application tests: pass.
- `CalendarPersistencePostgresTest`: pass with the new boundary, concurrency, starvation and corruption cases.
- Combined calendar domain, cycle, persistence, translator and HTTP integration gate: pass, exit code 0.
- Full backend `mvn -q test`: pass, exit code 0; the complete Spring, Flyway and Testcontainers suite finished successfully.
- `git diff --check`: pass after evidence finalization.

## External evidence boundary

No hosted GitHub Actions run, push, PR update or merge is claimed. This evidence is local only until authentication and the external gate are executed separately.
