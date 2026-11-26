# PCC-008E atomic in-app handoff implementation evidence — 2026-11-25

## Scope and activation boundary

This cut implements the atomic handoff from a valid fenced calendar occurrence to one in-app `CAMPAIGN` notification. It does not register a route, timer, scheduler, background executor or automatic Spring worker. It does not activate SMTP or any external transport. PCC-008F retains activation and readiness; PCC-009 retains the broader browser, hosted CI and merge gate.

## Test-first implementation

The first focused compile failed because the closed handoff results, persistence port and service did not exist. The implementation then added:

- closed Kotlin handoff results for emitted, replayed, skipped, lost-fence, missing and corrupt outcomes;
- a closed notification-ingestion disposition that distinguishes a newly created alert from delivery replay, episode reuse, delivery conflict and unknown data;
- one transaction that locks and validates the occurrence, switch, event, immutable definition/rule, latest applied resume evidence and notification advisory keys in the reviewed order;
- a fresh whole-second handoff instant captured only after every possible lock wait;
- atomic creation of the notification plus immutable occurrence evidence and the final `EMITTED` transition;
- exact replay validation under the occurrence lock, including delivery/source identity, alert lifecycle, revision and attempt evidence;
- fail-closed skip guards for late leases, switch disablement, re-enable cutoffs, definition changes, resume cutoffs and terminal event states;
- V39 constraints, deferred bidirectional consistency checks and restricted `SECURITY DEFINER` capabilities without granting direct runtime updates;
- the reviewed attempt range expansion so a valid third lease can be skipped while an already expired third lease remains `DEAD` during claim.

Only notification ingestion disposition `CREATED` is accepted by first handoff. Replays require the exact immutable handoff evidence. No `CAMPAIGN` email projection is created.

## Review defects and repairs

Two independent GPT-6.1 Sol reviewers at medium reasoning reviewed architecture/domain and PostgreSQL/security/concurrency. Their initial `NO-GO` findings were repaired by:

- capturing `handoffAt` after all advisory waits;
- validating full replay evidence before returning a stale-fence result;
- locking notification delivery before episode across every ingestion producer;
- rejecting alternative delivery reuse and proving the exact created alert identity;
- distinguishing persisted corruption from infrastructure failure so only the former becomes a closed `Corrupt` result;
- using immutable reads protected by database triggers where `FOR SHARE` would require an inappropriate runtime update privilege;
- adding a narrow occurrence-lock capability with null and zero UUID rejection.

Final architecture review: `GO`, no P0–P3 findings. Final concurrency/security review: `GO`, no P0–P3 findings. Both approvals apply only to the inactive PCC-008E cut.

## Adversarial coverage

- first emit and exact replay without duplicate alert or email;
- stale owner and stale attempt fencing;
- replay corruption checked before stale-fence classification;
- missing, partial and contradictory handoff evidence;
- wrong source fingerprint and wrong alert identity;
- concurrent handoff of the same occurrence;
- concurrent alternative delivery for the same episode rejected at deferred commit;
- all skip guards on a valid third lease;
- exact lease boundary before, at and after expiry;
- real delivery-lock wait that crosses lease expiry;
- notification projection failure rolling back every effect;
- database failures at alert, source, evidence and final occurrence update rolling back every effect;
- eligible opted-in email projection for a normal alert while `CAMPAIGN` remains in-app only;
- V38 to V39 upgrade with published checksum preservation and clean V35 upgrade;
- least-privilege runtime access and invalid occurrence-lock arguments.

## Local verification

- `CalendarOccurrenceHandoffTest`: 3 tests, 0 failures, 0 errors, 0 skipped.
- `CalendarPersistencePostgresTest`: 41 tests, 0 failures, 0 errors, 0 skipped.
- `NotificationPersistencePostgresTest`: 9 tests, 0 failures, 0 errors, 0 skipped.
- Combined focal gate: 53 tests, pass, exit code 0.
- The full backend gate exposed a historical race-test synchronization defect: `RecoveryHttpIntegrationTest` accepted any worker lock wait instead of proving the worker was blocked by the transaction under test. The test now records both PostgreSQL backend PIDs and requires `pg_blocking_pids(worker)` to contain the exact blocker. Product recovery behavior was not relaxed.
- Isolated `RecoveryHttpIntegrationTest`: pass, exit code 0 after the blocker-specific repair.
- Isolated `CredentialCoherenceIntegrationTest`: pass, exit code 0; no contract or expectation change was made.
- Final full backend `mvn -q -f backend/pom.xml test`: 768 tests, 0 failures, 0 errors, 9 skipped, pass, exit code 0 after approximately 632 seconds.
- Independent Surefire scan: 132 reports, 768 tests, 0 failure lines and 0 error lines.
- `git diff --check`: pass after evidence finalization.

## External evidence boundary

No hosted GitHub Actions run, push, PR update or merge is claimed. GitHub authentication remains unavailable in this workspace, so this evidence is local only until the external gate is executed separately.
