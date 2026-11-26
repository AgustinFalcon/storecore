VERDICT: APPROVED

# Independent architecture, security and concurrency review — PR #417

- Provider: OpenAI
- Model: GPT-6.1 Sol
- Effort: medium
- Date: 2026-11-26
- PR: https://github.com/AgustinFalcon/storecore/pull/417
- Title: `fix: close calendar runtime and reporting gates`
- Current base ref: `origin/master`, `36b08b83d1f80e7642a9fcdfe134a5a16794b9df`
- Comparison merge-base: `52922f5edd043d73563bba43467dab58613fbab9`
- Reviewed head: `f091d4fc58ed25d8a9f345f592e386c2364f81fb`
- Lane: architecture/security/concurrency; no production changes, commit or push.

## Review order and scope

Read `.cursor/rules/pr-dual-sol-review.mdc`, `AGENTS.md`, STATUS/PROJECT/PATTERNS, PR title/body, the active Phase 1 functional objective and technical contracts, calendar activation evidence and corrective PR #415 architecture/security receipt. Fetched `origin master` and verified both full SHAs. Read the complete `origin/master...HEAD` diff, ran focused validation, then assessed the implementation against the repository's hexagonal architecture, closed-type, PostgreSQL integrity, least-privilege and fail-closed standards. Coordinated the final finding with the independent UX/SDD lane.

## Resolved finding from the initial review

P2 (resolved) — validation and merge tasks were prematurely complete. At the initial head `3d6436d1814ae8e26efc26074f554b3e7edc6dba`, `sdd/wip/20261122-phase1-commercial-coordination/3-tasks/tasks.json:22` and `:43` mark PCC-009 and PCC-013 `completed`, while their linked `evidence/pcc-009-013-hosted-closeout-20261126.md:55` says closure requires PR #417's two persisted approvals, hosted CI and merge. Those gates remain pending at this head. This contradicts the machine-readable task state and can advance the next slice prematurely. Keep both tasks `in_progress` with their evidence links until that gate actually closes. The successor `001e1add42c21ee30696302cb5d5d68e24a372a5` commits the correction: both tasks are `in_progress` and retain their evidence links. This finding is closed.

No additional P0–P3 architecture/security/concurrency defect was found in the runtime repair.

## Focused validation on initial head `3d6436d`

- Executed offline Maven with the calendar domain, runtime-admission, PostgreSQL persistence and HTTP integration selections: 64 tests passed, zero failures/errors/skips, exit code 0. Fresh Surefire reports show `CalendarDomainTest` 10, `CalendarRuntimeAdmissionTest` 1, `CalendarPersistencePostgresTest` 45, and `CalendarHttpIntegrationTest` 8. The command also named two nonexistent generic capability test patterns; no capability test pass is claimed from those patterns.
- Real PostgreSQL 16.14 tests exercised all denied capability states, disabled-capability claim producing `CAPABILITY_BLOCKED`, kill-before-handoff with zero alerts/evidence, and an admission blocked on a concurrent kill transaction observing its committed kill. Existing persistence cases exercised atomic handoff, replay, fencing, competing runners, rollback, late leases, no-backfill and zero email effects.
- Clean V1–V40 installation and V35/V38 upgrades passed, including preserved published history/checksums, Flyway validation and no-op migration replay. Reviewed diff changes no published migration.
- Existing PostgreSQL least-privilege and invalid mutation-argument tests passed under `SET ROLE storecore_runtime`. Additionally queried the newly installed admission function directly in the isolated test container: owner `storecore_migrator`, SECURITY DEFINER true, `search_path=pg_catalog, public, pg_temp`, runtime EXECUTE true, PUBLIC EXECUTE absent.
- `git diff --check` passed; exact base/head remained unchanged after validation. Initial unquoted PowerShell test selection was corrected; the sandboxed Maven launch was denied access, and the authorized elevated local validation completed successfully.

## Implementation assessment and limits

Runtime admission is a dedicated application port and closed domain enum with one wire translator; unknown values and database-access failures translate to `UNKNOWN`, causing transaction rollback before claim or first handoff effects. `CAPABILITY_BLOCKED` is a closed internal terminal reason recognized consistently by the domain, persistence decoder and forward migration.

The database function locks the immutable action row before configuration and kill rows. Its action `FOR SHARE` conflicts with administration's `FOR UPDATE`, closing the empty-set kill insertion race; configuration sharing also serializes capability state changes. Production composition uses the same JDBC datasource and transaction as claim/handoff, so locks remain held through commit. Occurrence/switch locks precede admission, event and notification locks follow it; no new lock-order cycle with the existing capability mutation entrypoints was identified. An already emitted handoff still replays immutable evidence before current admission, preserving historical idempotency without creating another effect.

V40 only extends the skip vocabulary and installs the narrow admission function. Replaced writer functions retain their existing ownership/ACLs; the new function is schema-qualified and search-path pinned, with PUBLIC execution revoked and only runtime execution granted. Direct occurrence and handoff mutation privileges stay revoked. No SYSTEM publishing permission, external provider call, email path, public route or automatic capability promotion is added.

This is local focused evidence, not full-backend or hosted #417 CI approval. Historical #415 CI remains explicitly identified as a synthetic merge run and is not reused as exact-head #417 evidence. The task-state repair is reviewed below. The independent approval and documented hosted/merge gate remain necessary. No deployment, live activation, secrets, archive or homologation is authorized by this receipt.

## Re-review at exact successor head

Re-read the GitHub PR title/body and verified base `52922f5edd043d73563bba43467dab58613fbab9` and head `001e1add42c21ee30696302cb5d5d68e24a372a5` against local refs. Read the full `origin/master...HEAD` diff and the successor delta, including the two initial CHANGES_REQUIRED receipts. After the focused checks, re-examined the runtime wiring, admission SQL and claim/handoff changes; no production regression or remaining P0–P3 finding exists. Coordinated that result with the UX/SDD lane.

Fresh re-review validations:

- Parsed tasks.json and asserted exactly one PCC-009 and PCC-013, both `in_progress`, each pointing to an existing evidence file.
- `git diff --quiet 3d6436d1814ae8e26efc26074f554b3e7edc6dba HEAD -- backend frontend` passed: production, migration and tests are identical to the candidate on which the 64-test PostgreSQL/Kotlin/HTTP validation above ran.
- Both committed-range and working-tree `git diff --check` passed.
- Confirmed that close-out evidence still keeps loyalty blocked until dual approvals, hosted CI and merge; no live activation or retroactive approval claim was introduced.

No Maven rerun is claimed for the documentation-only successor: prior execution is explicitly attributed to `3d6436d`, with exact code identity checked at this head. APPROVED applies to the exact successor head recorded above; it does not assert hosted CI success or completion of the still-open validation/merge tasks.

## Re-review of Flyway expectation repair — f091d4f

VERDICT: APPROVED for exact head `f091d4fc58ed25d8a9f345f592e386c2364f81fb`; no open P0–P3. Read the complete `origin/master...HEAD` change set and successor delta after the prior reviews. The current origin/master is `36b08b83d1f80e7642a9fcdfe134a5a16794b9df`; its comparison merge-base with this head remains `52922f5edd043d73563bba43467dab58613fbab9`. This receipt distinguishes the moving base ref from the three-dot diff baseline and does not claim a merged-current-master test run.

The successor changes exactly 14 expected latest-schema assertions across 13 Kotlin test files. Independently checked the complete changed lines and programmatically asserted that each new line equals its predecessor with only the literal expected version `39` replaced by `40`. All operations under test, upgrade starting versions, checksum/history comparisons, privilege checks, business fixture assertions, Flyway validation and idempotent migration checks remain intact. V40 is the legitimate latest migration added by this PR; demanding V39 after unrestricted migration was a stale test expectation. These changes neither skip tests nor relax a domain invariant and introduce no domain string comparison or SOLID boundary change.

Fresh checks passed: full-range `git diff --check`; task JSON parse; PCC-009/PCC-013 still `in_progress`; no delta from previously approved f8e5dce in production code, migrations, frontend, WIP tasks or evidence. Rechecked the runtime admission and V40 safety assessment against that unchanged production content. Coordinated with the UX/SDD lane, which independently reached the same result.

Local execution evidence supplied by the coordinator: the focal 13-class suite exited 0, followed by the full backend suite with 856 tests, zero failures, zero errors and nine skips. Independently parsed all 143 local Surefire XML reports and reproduced exactly those full-suite totals. These executions were not rerun by this reviewer; the earlier 64-test execution remains my independent runtime/migration validation, while this re-review verifies the narrowly changed assertions and current full-suite report evidence. The nine skips are retained as skips, not passes. No hosted CI result is inferred from local reports.

The initial P2 remains resolved. This approval covers the reviewed diff and exact head only; live providers, deployment, archive, homologation and the hosted/merge close-out gates remain outside the verdict.
