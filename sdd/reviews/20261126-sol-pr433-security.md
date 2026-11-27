VERDICT: APPROVED

## Evidence identity

- provider: OpenAI
- model: gpt-5.6-sol-medium
- effort: medium
- lane: security
- independent of the architecture lane (this review did not read the PR #433
  architecture-lane file)
- PR: #433 OPEN, `feat(media): attest PID 1 restart after Allocated with absent units`
- URL: https://github.com/AgustinFalcon/storecore/pull/433
- branch: `feat/media-broker-4c-restart-allocated-20261126`
- base: `master`
- head SHA: `f54c78857a6c1dd8b2a39191872338bd5b383a26`
- base SHA: `38cd39a48e840f2ad457aae8ac3a9ee4d892c59b`
- exact review range:
  `38cd39a48e840f2ad457aae8ac3a9ee4d892c59b...f54c78857a6c1dd8b2a39191872338bd5b383a26`
- diff identity: 5 files, 141 insertions, 9 deletions
- files: `backend/media-broker/src/dbus.rs`,
  `backend/media-broker/src/reconcile.rs`, `sdd/STATUS.md`, WIP
  `progress.md`, and WIP `meta.md`
- commit: `f54c78857a6c1dd8b2a39191872338bd5b383a26`
- `git diff --check` on the exact three-dot range: clean
- this file is not a GitHub approval and does not close or check off
  `MEDIA-NORMALIZE-003B-4C`

## Hosted Verify

Verify run `45923481080` completed successfully on exact head
`f54c78857a6c1dd8b2a39191872338bd5b383a26`. All 7 jobs succeeded:

- repository-hygiene `140259369812`
- media-broker `140259427270`
- media-broker-pid1 `140259427443`
- backend `140259427224`
- frontend `140259427260`
- productive-routes-real-e2e `140259427234`
- unified-access-real-e2e `140259427302`

The PID 1 job log explicitly records:
`pid1_allocated_job_survives_restart_with_absent_units ... ok`.
Its PID 1 suite passed 35 tests with 0 failures, and the dedicated follow-up
invocation passed 1 test with 0 failures.

## Why this cut

The PR body, STATUS, ADR-001, technical spec, plan, progress, and meta agree on
the narrow restart property. Reopening the durable journal after `Allocated`
must leave admission `RecoveryPending`; allocation remains blocked until exact
runtime inventory is reconciled. An absent derived mount and worker permit the
original `Allocated` record and reservation to survive while clean
reconciliation reopens admission.

ADR-001 still requires restart coverage at every durable transition, exact
journal/mount/unit identity, termination and reconciliation of active runtime,
and cleanup only after proving no PID, cgroup, or mount remains. Discrepancy
must quarantine evidence and keep the gate closed. The plan correctly leaves
`MEDIA-NORMALIZE-003B-4C` unchecked.

## Security review

- `BrokerStore::open` restores `RecoveryPending`, and `allocate` rejects every
  status other than `Open`. The new unit and PID 1 regressions prove that a
  second allocation is rejected before reconciliation.
- The durable `Allocated` state expects no runtime. Existing reconciliation
  accepts only `Allocated`/`InputSealed` plus `RuntimeState::Absent` as a clean
  non-running combination; active, terminal, unknown, duplicate, orphaned, or
  unavailable evidence follows the existing mismatch/quarantine or fail-closed
  paths.
- `Pid1AbsentUnits::enumerate` returns an empty inventory only when both the
  exact derived `.mount` and worker unit return `SystemdError::NotLoaded`.
  Any `Active`, `Inactive`, `Failed`, unknown, or D-Bus error returns
  `AdapterError::Unavailable`, so an unexpected active unit cannot be swept as
  a successful absence.
- `Pid1AbsentUnits::terminate` is deliberately `Unavailable`. The clean absent
  path never invokes it; if reconciliation attempted termination, it could not
  manufacture `Terminal` success.
- The PID 1 test derives both unit identities from the durable `JobId`, checks
  both exact names through the system bus, preserves the original record and
  reservation, and only then confirms admission reopened.
- The full diff adds no `unsafe`, dependency or `Cargo.toml` change, secret,
  credential, HTTP route, Java/Temurin pin, `Ready` result, production
  systemd method, D-Bus allowlist expansion, or capability activation. The
  new PID 1 adapter and systemd calls are test-only.
- STATUS, progress, and meta retain restart coverage after `InputSealed` and
  the other durable transitions, socket-family attestation, `Ready`, HTTP,
  `003B-4B-3`, `003B-4B-4`, `003B-4C`, `003B-4`, TASK-005, and issue #7 as
  open residuals.

## Findings

P0: none.

P1: none.

P2: none.

P3: none.

## Verdict

APPROVED for exact head `f54c78857a6c1dd8b2a39191872338bd5b383a26`
over base `38cd39a48e840f2ad457aae8ac3a9ee4d892c59b`. Verify
`45923481080` is independently confirmed 7/7 on that head, including the
dedicated PID 1 restart-after-Allocated regression. This is not a GitHub
approval and does not close or check off `MEDIA-NORMALIZE-003B-4C`.
