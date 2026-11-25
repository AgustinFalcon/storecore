# PCC-008F local activation and readiness implementation evidence — 2026-11-25

## Scope and default-off boundary

This cut composes the already reviewed calendar lifecycle cycle, occurrence claim and atomic in-app handoff behind exact property `storecore.calendar.runner-enabled=true`. Absent, explicit false and noncanonical values create no activation graph and report readiness `UNAVAILABLE`. Exact true creates one fixed-delay local adapter, one runner and one stable non-zero process owner and reports readiness `READY` for wiring only.

The implementation adds no public/manual trigger, migration, privilege, external call or email path. It does not derive readiness from capability, switch effectivity, database health or the last tick. The audited reminder switch continues to decide whether a claimed reminder may create an in-app effect.

## Test-first implementation

The first focal compile failed because the runner, closed tick results, activation translator and scheduled adapter did not exist. The smallest implementation then added:

- closed `CalendarRunnerActivation`, `CalendarRunnerFailureStage` and sealed tick-result vocabularies;
- one immutable progress object that validates lifecycle, claim and handoff counter equations;
- one application runner with JVM-local overlap exclusion and a `finally` release;
- exactly one default lifecycle page, one default occurrence page and sequential handoff in claim order;
- corruption and infrastructure short-circuits that never manufacture settlement or touch later leases;
- a five-second fixed-delay adapter with a five-second initial delay;
- conditional Spring composition using the existing clock and JDBC persistence;
- a closed readiness port consumed by the existing ADMIN diagnostic response.

No exception text crosses the boundary. A thrown handoff reports only the closed `HANDOFF` stage and confirmed lower-bound progress; uncertain in-flight work remains recoverable only through the existing deterministic receipts, leases, fencing and immutable handoff evidence.

## Review defect and repair

Two independent GPT-6.1 Sol reviewers at medium reasoning reviewed architecture/SOLID and concurrency/fail-closed behavior. Both initially returned `NO-GO` for one P2 test defect: the inactive ApplicationContext matrix loaded only the readiness configuration, so runner absence was tautological and could not detect an unsafe activation regression.

The matrix was repaired to load both production configurations for absent, false and noncanonical values and to assert absence of the lifecycle service, occurrence worker, handoff service, owner bean, runner and scheduled adapter while readiness remains `UNAVAILABLE`. Identity-disabled startup proves the same graph absence. The repaired focal test passed, and both reviewers then returned `APPROVE` with no remaining P0–P3 findings.

## Adversarial coverage

- exact activation parsing with unknown values failing closed;
- full production bean graph absent by default, explicit false, noncanonical values and identity-disabled startup;
- exact true graph presence, `READY`, singleton runner and stable non-zero owner;
- fixed-delay and initial-delay cadence;
- lifecycle -> claim -> sequential handoff order and default batch sizes;
- exhaustive emitted, replayed, skipped, lost-fence and missing accounting;
- lifecycle, claim and handoff corruption short-circuits;
- infrastructure exceptions at lifecycle, claim and handoff stages;
- no synthetic failure settlement after uncertain handoff;
- local overlap returning `BUSY` without a second delegate call, followed by guard release;
- two independent runners against PostgreSQL producing one handoff, one source event, one in-app alert and zero email intents;
- explicit HTTP proof that no runner/trigger/run route is mapped.

## Local verification

- Runner focal suite: 9 tests, 0 failures, 0 errors, 0 skipped.
- Activation wiring suite: 3 tests, 0 failures, 0 errors, 0 skipped.
- Real PostgreSQL two-runner focal test: pass, exit code 0.
- Calendar affected suite before the final no-route assertion: 90 tests across 9 reports, 0 failures, 0 errors, 0 skipped.
- First full-backend attempt: 781 tests, 0 assertion failures, 1 historical timing error, 9 skipped. `EmailVerificationPostgresTest` observed a transient Docker/PostgreSQL clock reversal where `terminal_at` was approximately 0.74 seconds before `issued_at`; no PCC-008F code was involved and no constraint was relaxed.
- Isolated failing email-verification test: pass, exit code 0 without code or expectation changes.
- Final full-backend `mvn -q -f backend/pom.xml test`: 781 tests, 0 failures, 0 errors, 9 skipped, exit code 0 after approximately 636 seconds.
- Final `CalendarHttpIntegrationTest` after adding the explicit absent-route assertion: 8 tests, 0 failures, 0 errors, 0 skipped, exit code 0.
- Final Surefire inventory: 134 reports, 782 current tests, 0 failures, 0 errors, 9 skipped.
- `git diff --check`: pass.

## External evidence boundary

No hosted GitHub Actions run, push, PR update or merge is claimed. PCC-008F is locally complete; PCC-008 remains open until PCC-009 supplies the broader browser, hosted CI and merge evidence.
