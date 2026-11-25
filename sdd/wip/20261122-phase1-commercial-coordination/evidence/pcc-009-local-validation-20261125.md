# PCC-009 local validation evidence — 2026-11-25

## Scope

This checkpoint validates the integrated calendar activation cut without claiming the hosted Linux browser gate, GitHub Actions, PR update or merge. PCC-009 remains pending until those external gates exist.

## Independent review findings and repair

Two independent GPT-6.1 Sol reviewers at medium reasoning returned `NO-GO` on the integrated cut with the same two P2 findings:

1. the frontend boundary rejected the valid `READY` readiness wire while the detail/editor presentation hardcoded the unavailable explanation;
2. reminder-switch enable captured its durable no-backfill cutoff before waiting for the singleton switch lock, so an occurrence becoming due during lock contention could be treated as pre-enable history incorrectly.

The repair keeps both vocabularies closed. `CalendarReminderReadiness` now owns the truthful presentation message; `CalendarReminderChannel` owns channel guidance; the boundary accepts only the closed known readiness cases and still rejects `Unknown`. The PostgreSQL switch writer now acquires the singleton lock, checks capability and authorization, and only then captures and validates the durable command timestamp used as the enable cutoff.

The first re-review correctly found that the initial `READY` copy still overclaimed “active reminders” even though readiness proves only local runner composition and may coexist with a disabled switch. The closed `Ready` case now says only that the local runner is available and explicitly denies that readiness proves an effective switch or a delivered reminder. A semantic domain test preserves that distinction.

## Test-first evidence

- Frontend focal RED: the new readiness-owned presentation test failed because `message` did not exist.
- Frontend focal GREEN: mapper, domain and presentation suites passed 30/30 after the smallest implementation.
- Post-review copy repair: the two affected Angular suites passed 21/21 through the official Angular test harness; lint passed.
- Backend PostgreSQL RED: the lock-contention regression expected the post-lock instant `12:55:10` but observed the pre-lock instant `12:54:50`.
- Backend PostgreSQL GREEN: after moving timestamp capture behind the lock/capability/authorization admission, the same real PostgreSQL regression passed and the occurrence was terminally skipped with `ENABLE_CUTOFF` and no lease.

## Final local verification

- Frontend lint: pass.
- Frontend unit/component suite: 240 files, 1,708 tests, 0 failures.
- Frontend production build: pass; initial bundle is 713.77 kB, 13.77 kB above the current 700 kB warning budget.
- Backend affected calendar suite: 79 tests, 0 failures, 0 errors, 0 skipped, including 43 real PostgreSQL persistence tests.
- PSD structural/security/unit gate: 13 tests passed; TypeScript, ESLint and Playwright collection passed; 144 real-browser cases were enumerated.
- `git diff --check`: pass; only Git line-ending conversion warnings were emitted.

## Final review result

After the wiring-only copy repair, both independent GPT-6.1 Sol reviewers returned `APPROVE` with no remaining P0–P3 findings. One reviewed architecture, closed frontend types and SDD consistency; the other reviewed PostgreSQL concurrency, idempotency and fail-closed no-backfill behavior. The final full Angular suite on the exact reviewed diff passed 240 files and 1,708 tests.

## Honest gate boundary

The actual `REAL_BACKEND` browser execution intentionally refuses this Windows environment because the PSD contract requires a non-root Linux runtime UID with loopback-only IPv4/IPv6 owner firewall rules. Its canonical hosted Linux execution has not run in this checkpoint. No hosted CI, push, PR change, merge or SDD archive is claimed. The parent PCC-008 and PCC-009 therefore remain open.
