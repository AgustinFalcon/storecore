VERDICT: CHANGES_REQUIRED

# Independent architecture, security and concurrency review — PR #417

- Provider: OpenAI
- Model: GPT-6.1 Sol
- Effort: medium
- Date: 2026-11-26
- PR: https://github.com/AgustinFalcon/storecore/pull/417
- Title: `fix: close calendar runtime and reporting gates`
- Base: `origin/master`, `52922f5edd043d73563bba43467dab58613fbab9`
- Reviewed head: `3d6436d1814ae8e26efc26074f554b3e7edc6dba`
- Lane: architecture/security/concurrency; no production changes, commit or push.

## Review order and scope

Read `.cursor/rules/pr-dual-sol-review.mdc`, `AGENTS.md`, STATUS/PROJECT/PATTERNS, PR title/body, the active Phase 1 functional objective and technical contracts, calendar activation evidence and corrective PR #415 architecture/security receipt. Fetched `origin master` and verified both full SHAs. Read the complete `origin/master...HEAD` diff, ran focused validation, then assessed the implementation against the repository's hexagonal architecture, closed-type, PostgreSQL integrity, least-privilege and fail-closed standards. Coordinated the final finding with the independent UX/SDD lane.

## Finding

P2 — validation and merge tasks are prematurely complete. At the reviewed head, `sdd/wip/20261122-phase1-commercial-coordination/3-tasks/tasks.json:22` and `:43` mark PCC-009 and PCC-013 `completed`, while their linked `evidence/pcc-009-013-hosted-closeout-20261126.md:55` says closure requires PR #417's two persisted approvals, hosted CI and merge. Those gates remain pending at this head. This contradicts the machine-readable task state and can advance the next slice prematurely. Keep both tasks `in_progress` with their evidence links until that gate actually closes. The coordinator has prepared this correction in the working tree; this verdict still evaluates committed head `3d6436d` and does not approve an unreviewed successor.

No additional P0–P3 architecture/security/concurrency defect was found in the runtime repair.

## Focused validation

- Executed offline Maven with the calendar domain, runtime-admission, PostgreSQL persistence and HTTP integration selections: 64 tests passed, zero failures/errors/skips, exit code 0. Fresh Surefire reports show `CalendarDomainTest` 10, `CalendarRuntimeAdmissionTest` 1, `CalendarPersistencePostgresTest` 45, and `CalendarHttpIntegrationTest` 8. The command also named two nonexistent generic capability test patterns; no capability test pass is claimed from those patterns.
- Real PostgreSQL 16.14 tests exercised all denied capability states, disabled-capability claim producing `CAPABILITY_BLOCKED`, kill-before-handoff with zero alerts/evidence, and an admission blocked on a concurrent kill transaction observing its committed kill. Existing persistence cases exercised atomic handoff, replay, fencing, competing runners, rollback, late leases, no-backfill and zero email effects.
- Clean V1–V40 installation and V35/V38 upgrades passed, including preserved published history/checksums, Flyway validation and no-op migration replay. Reviewed diff changes no published migration.
- Existing PostgreSQL least-privilege and invalid mutation-argument tests passed under `SET ROLE storecore_runtime`. Additionally queried the newly installed admission function directly in the isolated test container: owner `storecore_migrator`, SECURITY DEFINER true, `search_path=pg_catalog, public, pg_temp`, runtime EXECUTE true, PUBLIC EXECUTE absent.
- `git diff --check` passed; exact base/head remained unchanged after validation. Initial unquoted PowerShell test selection was corrected; the sandboxed Maven launch was denied access, and the authorized elevated local validation completed successfully.

## Implementation assessment and limits

Runtime admission is a dedicated application port and closed domain enum with one wire translator; unknown values and database-access failures translate to `UNKNOWN`, causing transaction rollback before claim or first handoff effects. `CAPABILITY_BLOCKED` is a closed internal terminal reason recognized consistently by the domain, persistence decoder and forward migration.

The database function locks the immutable action row before configuration and kill rows. Its action `FOR SHARE` conflicts with administration's `FOR UPDATE`, closing the empty-set kill insertion race; configuration sharing also serializes capability state changes. Production composition uses the same JDBC datasource and transaction as claim/handoff, so locks remain held through commit. Occurrence/switch locks precede admission, event and notification locks follow it; no new lock-order cycle with the existing capability mutation entrypoints was identified. An already emitted handoff still replays immutable evidence before current admission, preserving historical idempotency without creating another effect.

V40 only extends the skip vocabulary and installs the narrow admission function. Replaced writer functions retain their existing ownership/ACLs; the new function is schema-qualified and search-path pinned, with PUBLIC execution revoked and only runtime execution granted. Direct occurrence and handoff mutation privileges stay revoked. No SYSTEM publishing permission, external provider call, email path, public route or automatic capability promotion is added.

This is local focused evidence, not full-backend or hosted #417 CI approval. Historical #415 CI remains explicitly identified as a synthetic merge run and is not reused as exact-head #417 evidence. After the task-state repair, two fresh exact-head approvals and the documented hosted/merge gate remain necessary. No deployment, live activation, secrets, archive or homologation is authorized by this receipt.
