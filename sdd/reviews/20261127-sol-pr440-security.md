VERDICT: APPROVED

## Evidence identity

- provider: OpenAI
- model: gpt-5.6-sol-medium
- effort: medium
- lane: security
- independent of the architecture lane (this review did not read the PR #440 architecture-lane file).
- PR: #440 OPEN, `feat(media): attest PID 1 restart after Running with absent units quarantines`
- URL: https://github.com/AgustinFalcon/storecore/pull/440
- branch: `feat/media-broker-4c-restart-running-20261127`
- base branch: `master`
- head SHA: `dd2de3651427c93ab496aad35a1fa30529b9bfd2`
- base SHA: `2d013752f3b9ca2fe929c456e2d7082438dc4ea9`
- exact range:
  `2d013752f3b9ca2fe929c456e2d7082438dc4ea9...dd2de3651427c93ab496aad35a1fa30529b9bfd2`
- diff identity: 4 files, +184/-2
- files: `backend/media-broker/src/dbus.rs`,
  `backend/media-broker/src/reconcile.rs`, `sdd/STATUS.md`, WIP
  `progress.md`
- `git diff --check` on the exact three-dot range: clean
- Verify: `45950722247`, event `pull_request`, `completed` / `success`,
  headSha `dd2de3651427c93ab496aad35a1fa30529b9bfd2`
- this file is not a GitHub approval and does not merge or close `003B-4C`

## Hosted Verify

All 7 jobs completed successfully on the exact head:

- repository-hygiene `140345678536`
- media-broker `140345755590`
- media-broker-pid1 `140345755578`
- backend `140345755668`
- frontend `140345755663`
- productive-routes-real-e2e `140345755499`
- unified-access-real-e2e `140345755589`

Focused evidence:

- `media-broker` passed 84 regular tests, including
  `reconcile::tests::running_job_is_quarantined_after_restart_with_absent_runtime
  ... ok`; 0 failed. Format, clippy, dependency-license, CycloneDX SBOM, and
  HIGH/CRITICAL CVE gates also completed successfully with the lockfile.
- `media-broker-pid1` passed
  `dbus::tests::pid1_running_job_is_quarantined_after_restart_with_absent_units
  ... ok` for JobId `[0x2e; 16]`; its PID 1 suite reported 38 passed and 0
  failed.
- The run and every listed job concluded `success`. No cancelled or skipped
  job was counted as passing. The stale-head `ccfdf839` 7/7 run was not used
  as evidence for this candidate.

## Why this cut

The PR title/body, STATUS next-cut statement, progress Running restart
heading, meta, ADR-001 restart-before-admission and fail-closed mismatch /
quarantine contract, and plan agree on the narrow property under review.
Reopening a `Running` job must remain `RecoveryPending`; an absent runtime is
a mismatch because `Running` expects one, so reconciliation must quarantine
the job and keep global admission closed.

The plan still records `MEDIA-NORMALIZE-003B-4C` as `[ ]`. The next cut is
restart after `Terminating`; this PR does not attest later durable states,
socket families, `Ready`, HTTP, or completion of the aggregate gates.

## Security review

- The PID 1 regression reaches durable `Running`, drops and reopens the store,
  proves `RecoveryPending`, and rejects allocation of `[0x2f; 16]` with
  `AdmissionClosed` before inventory reconciliation or effects.
- The attested job identity is fixed as `[0x2e; 16]`.
  `TransientUnits::derive` derives the exact `.mount`, worker unit, and
  `Where` internally from that `JobId` plus root-owned configuration. The diff
  adds no client-supplied command, `ExecStart`, path, `Where`, unit name, or
  D-Bus property.
- The harness directly attests both exact derived units as `NotLoaded`.
  `Pid1AbsentUnits::enumerate` returns an empty inventory only for the dual
  `NotLoaded` tuple; every other tuple is `Unavailable`. Its `terminate`
  implementation always returns `Unavailable`, so a clean report cannot be
  manufactured by a hidden kill.
- `JobState::Running` satisfies `expects_runtime`. Empty inventory therefore
  resolves to `Absent`, records a mismatch, transitions the record to
  `Quarantined`, persists `ReconciliationMismatch`, and leaves admission
  blocked.
- The consistent clean path is unchanged: only `Allocated | InputSealed` with
  `Absent` returns clean without quarantine. Their existing restart behavior
  remains intact.
- `Terminating` restart, socket-family attestation, `Ready`, and HTTP remain
  unattested. `ProtectHome`, `RestrictAddressFamilies`, and `CPUQuota` remain
  explicitly out of scope.
- The full three-dot diff adds two narrow tests and SDD status updates. It adds
  no secret or credential, HTTP route, capability `Ready`, Java pin/retarget,
  production execution surface, deploy, tag, or publish behavior.
- `backend/media-broker/src/lib.rs` still has
  `#![forbid(unsafe_code)]`. No unsafe production code was introduced.
- STATUS, progress, meta, and plan retain `003B-4B-3`, `003B-4B-4`,
  `003B-4C`, `003B-4`, TASK-005, issue #7, `Ready`, and media HTTP as open or
  out of scope.

## Open residuals

- restart/reconciliation after `Terminating` and the remaining durable states
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

APPROVED for exact head `dd2de3651427c93ab496aad35a1fa30529b9bfd2`
over base `2d013752f3b9ca2fe929c456e2d7082438dc4ea9`. Verify
`45950722247` is independently confirmed final 7/7 on that head, including
both the unit-level and PID 1 Running restart regressions. This is not a
GitHub approval and does not merge or close `003B-4C`; `Terminating` onward,
sockets, `Ready`, and HTTP remain unattested.
