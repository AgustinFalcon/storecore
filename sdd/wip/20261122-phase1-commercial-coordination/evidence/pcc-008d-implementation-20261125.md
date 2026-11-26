# PCC-008D durable occurrence claim implementation evidence — 2026-11-25

## Scope and activation boundary

This cut implements the inactive durable occurrence claim, lease, fence, retry and crash-recovery contract. It registers no controller route, timer, scheduler, background executor or automatic Spring worker. It creates no notification, email or external effect and cannot mark an occurrence `EMITTED`. PCC-008E retains the atomic in-app notification handoff; PCC-008F retains activation and readiness.

## Test-first implementation

The first focused test compile failed because the closed lease owner/token, terminal reason, failure classification, bounded batch size, claim/settlement results, persistence port and worker service did not exist. The implementation then added:

- closed Kotlin domain/application types for every finite state and result;
- bounded page size 1..50 with default 50;
- one early whole-second `observedAt` and a later whole-second `leaseGrantedAt` after every selected row is locked and validated;
- PostgreSQL `SKIP LOCKED` selection ordered by `scheduled_at` and occurrence UUID;
- 60-second fenced leases with owner plus attempt, three-attempt maximum and exact-expiry takeover;
- durable switch, latest applied RESUME revision, event state, canonical definition and no-backfill cutoffs;
- retry settlement at +30 seconds and +2 minutes, with third or permanent failure becoming `DEAD`;
- restricted `SECURITY DEFINER` functions with safe search paths and no direct table-update grant;
- fail-closed whole-page rollback for corrupted persisted state while infrastructure failures still propagate.

## Review defects and repairs

The two independent GPT-6.1 Sol medium implementation reviewers initially returned `NO-GO`. Findings included infrastructure failures being translated as corrupt data, reference validation being bypassed by early terminal decisions, unsafe SQL casting of RESUME payloads, incomplete pending-state validation and canonical definition equality being checked too late.

The implementation was corrected to:

- catch only the private persisted-data corruption signal and let infrastructure exceptions escape;
- materialize, lock and decode every selected row, immutable rule/definition, current event and applied RESUME receipt before any mutation;
- select the latest RESUME by greatest decoded `after.revision`, independent of timestamps;
- validate the full pending metadata shape;
- compare the canonical approved definition before all terminal decisions when revisions match;
- roll back the whole selected page if any later row is corrupt;
- prove the lease timestamp is captured after a real blocked claim rather than with a synthetic clock-only test.

Final architecture review: `APPROVE`, no P0–P3 findings. Final concurrency/security review: `APPROVE`, no P0–P3 findings. Both approvals apply only to the inactive PCC-008D cut.

## Adversarial coverage

- stable cap and ordering across pages;
- two concurrent claimers without duplicate lease ownership;
- real database blocking with a clock advanced 120 seconds before lease grant;
- crash takeover before, at and after exact expiry;
- stale owner/fence rejection;
- third expired attempt becoming `DEAD`, including precedence over a later disabled switch;
- transient and permanent settlement paths;
- settlement before lease start, just before expiry and after expiry;
- disabled and re-enabled switch cutoffs;
- latest RESUME chosen by revision under inverted timestamps;
- paused, cancelled and completed event ineligibility;
- changed approved definitions and canonical mismatch corruption;
- corrupt pending terminal metadata and corrupt later-page context rolling back earlier candidates;
- no notification side effect.

## Local verification

- `CalendarOccurrenceWorkerTest`: 6 tests, 0 failures, 0 errors, 0 skipped.
- `CalendarPersistencePostgresTest`: 28 tests, 0 failures, 0 errors, 0 skipped.
- Combined calendar domain, worker, system cycle, persistence, HTTP translator and HTTP integration gate: pass, exit code 0.
- The first full backend gate exposed only historical assertions that the latest Flyway version was 37. All 14 published-version expectations were updated to 38 without changing their checksum-preservation assertions.
- The 13 affected migration/integration classes were rerun together: pass, exit code 0.
- Final full backend `mvn -q -f backend/pom.xml test`: pass, exit code 0 after 567 seconds.
- `git diff --check`: pass after evidence finalization.

## External evidence boundary

No hosted GitHub Actions run, push, PR update or merge is claimed. This evidence is local only until authentication and the external gate are executed separately.
