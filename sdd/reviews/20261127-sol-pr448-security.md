VERDICT: APPROVED

## Evidence identity

- provider: xAI
- model: grok-4.7-medium-fast
- effort: medium
- lane: security
- authorized substitute after gpt-5.6-sol-medium quota
- independent of the architecture lane (this review did not read the PR #448 architecture-lane file).
- PR: #448 OPEN, `feat(media): attest PID 1 restart after Quarantined with absent units stays blocked`
- URL: https://github.com/AgustinFalcon/storecore/pull/448
- branch: `feat/media-broker-4c-restart-quarantined-20261127`
- base branch: `master`
- head SHA: `db8182e134ccf4b9accba0f25021c22bc4e45925`
- base SHA: `0201151f98a57a272b62a1053b41c6187c3fe5de`
- exact range:
  `0201151f98a57a272b62a1053b41c6187c3fe5de...db8182e134ccf4b9accba0f25021c22bc4e45925`
- diff identity: 5 files, +135/-5
- files: `backend/media-broker/src/dbus.rs`,
  `backend/media-broker/src/reconcile.rs`, `sdd/STATUS.md`, WIP
  `progress.md`, WIP `meta.md`
- `git diff --check` on the exact three-dot range: clean
- local `HEAD` confirmed `db8182e134ccf4b9accba0f25021c22bc4e45925` on
  `feat/media-broker-4c-restart-quarantined-20261127`; the branch was left in place
- Verify: `46054038347`, event `pull_request`, `completed` / `success`,
  headSha `db8182e134ccf4b9accba0f25021c22bc4e45925`
- this file is not a GitHub approval and does not merge or close `003B-4C`

## Hosted Verify

All 7 jobs completed successfully on the exact head:

- repository-hygiene `140692083197`
- media-broker `140692162015`
- media-broker-pid1 `140692162022`
- backend `140692161985`
- frontend `140692162046`
- productive-routes-real-e2e `140692162092`
- unified-access-real-e2e `140692162021`

Focused evidence:

- `media-broker` passed 87 regular tests, including
  `reconcile::tests::quarantined_job_stays_blocked_after_restart_with_absent_runtime
  ... ok`; 0 failed. The job log shows the lockfile format/lint suite completed
  with that result.
- `media-broker-pid1` passed
  `dbus::tests::pid1_quarantined_job_stays_blocked_after_restart_with_absent_units
  ... ok`. The test source binds JobId `[0x34; 16]`. The PID 1 suite reported
  41 passed and 0 failed.
- `gh run view 46054038347 --json conclusion,headSha,event,status` is
  `success` / `db8182e134ccf4b9accba0f25021c22bc4e45925` / `pull_request` /
  `completed`. The run and every listed job concluded `success`. No cancelled
  or skipped job was counted as passing.

## Why this cut

The PR title/body, STATUS next-cut statement (expected Active inventory),
progress Quarantined restart heading, meta, ADR-001 restart-before-admission
and fail-closed mismatch latch, and plan agree on the narrow property under
review. Reopening a durable `Quarantined` job must stay `RecoveryPending`
until reconcile. An absent inventory is not a consistent pair for
`Quarantined`, so the job stays quarantined and global admission stays
`Blocked(ReconciliationMismatch)`. `Terminal` plus `Absent` remains the
clean/open path.

The plan still records `MEDIA-NORMALIZE-003B-4C` as `[ ]`. The next cut is
expected Active inventory; this PR does not attest socket families, `Ready`,
HTTP, or completion of the aggregate gates.

## Security review

- The PID 1 regression reaches durable `Quarantined` by reconciling the
  `[0x34; 16]` job after `Starting` against absent units, drops that store,
  and reopens it. On that second reopen, admission is `RecoveryPending`.
  `BrokerStore::allocate` returns `StoreError::AdmissionClosed` when admission
  is not `Open`, before `JobRecord::allocate`, budget admission, or journal
  persist. The attested call rejects `[0x35; 16]` before
  `pid1_assert_absent_quarantine` enumerates or reconciles inventory.
- The attested job identity is fixed as `[0x34; 16]`.
  `TransientUnits::derive` derives the exact `.mount`, worker unit, and
  `Where` internally from that `JobId` plus the harness root
  `/run/storecore_media/jobs`. The diff adds no client-supplied command,
  `ExecStart`, path, `Where`, unit name, or D-Bus property. Both exact derived
  units are attested `NotLoaded` before reconcile.
- `Pid1AbsentUnits::enumerate` returns an empty inventory only for the dual
  `NotLoaded` tuple; every other tuple is `Unavailable`. Its `terminate`
  implementation always returns `Unavailable`, so a clean report cannot be
  manufactured by a hidden kill.
- `JobState::expects_runtime` is only `Starting | Running | Terminating`.
  `Quarantined` therefore uses `reconcile_non_running`. The consistent pair
  set is `Allocated | InputSealed` with `Absent`, and `Terminal` with
  `Absent | Terminal`. `Quarantined` plus `Absent` is outside that set:
  `record_mismatch` persists `ReconciliationMismatch`, the job is not
  transitioned again because it is already `Quarantined`, and
  `finish_reconciliation` stays blocked both because mismatches are non-zero
  and because any `Quarantined` record requires intervention.
- The unit regression repeats that latch: after the job is quarantined, the
  second reopen is `RecoveryPending`, empty-inventory reconcile stays
  `AdmissionBlocked` with the record still `Quarantined` and admission
  `Blocked(ReconciliationMismatch)`, and a later allocate is
  `AdmissionClosed`.
- `Terminal` plus `Absent` remains the unchanged clean path:
  `reconcile_non_running` returns without a mismatch, and
  `terminal_job_survives_restart_with_absent_runtime` is not modified.
- Expected Active inventory, socket-family attestation, `Ready`, and HTTP
  remain unattested. `ProtectHome`, `RestrictAddressFamilies`, and `CPUQuota`
  remain explicitly out of scope.
- The full three-dot diff adds two narrow tests and SDD status updates. It
  adds no secret or credential, HTTP route, capability `Ready`, Java
  pin/retarget, production execution surface, deploy, tag, or publish
  behavior.
- `backend/media-broker/src/lib.rs` still has `#![forbid(unsafe_code)]`. No
  unsafe production code was introduced.
- STATUS, progress, meta, and plan retain `003B-4B-3`, `003B-4B-4`,
  `003B-4C`, `003B-4`, TASK-005, issue #7, `Ready`, and media HTTP as open or
  out of scope. This review does not check those boxes.

## Open residuals

- expected Active inventory and the remaining `003B-4C` harness
- socket-family attestation and `RestrictAddressFamilies`
- remaining effective hardening gaps including `CPUQuota` and `ProtectHome`
- `003B-4B-3`, `003B-4B-4`, `003B-4C`, `003B-4`, TASK-005, and `Ready`
- media HTTP, multipart, provider live, secrets, deploy, tag, and publish

## Findings

P0: none.

P1: none.

P2: none.

P3: none.

## Verdict

APPROVED for exact head `db8182e134ccf4b9accba0f25021c22bc4e45925`
over base `0201151f98a57a272b62a1053b41c6187c3fe5de`. Verify
`46054038347` is independently confirmed final 7/7 on that head, including
both the unit-level and PID 1 Quarantined restart regressions. This is not a
GitHub approval and does not merge or close `003B-4C`; expected Active
inventory, sockets, `Ready`, and HTTP remain unattested.
