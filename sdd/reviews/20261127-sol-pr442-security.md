VERDICT: APPROVED

## Evidence identity

- provider: OpenAI
- model: gpt-5.6-sol-medium
- effort: medium
- lane: security
- independent of the architecture lane (this review did not read the PR #442 architecture-lane file).
- PR: #442 OPEN, `feat(media): attest PID 1 restart after Terminating with absent units quarantines`
- URL: https://github.com/AgustinFalcon/storecore/pull/442
- branch: `feat/media-broker-4c-restart-terminating-20261127`
- base branch: `master`
- head SHA: `f1e8178d1cca1794491cfb09a524bbcc6fe932ea`
- base SHA: `2968857bafd7ec08c31c580c23d269df0454e475`
- exact range:
  `2968857bafd7ec08c31c580c23d269df0454e475...f1e8178d1cca1794491cfb09a524bbcc6fe932ea`
- diff identity: 5 files, +166/-4
- files: `backend/media-broker/src/dbus.rs`,
  `backend/media-broker/src/reconcile.rs`, `sdd/STATUS.md`, WIP
  `progress.md`, and WIP `meta.md`
- `git diff --check` on the exact three-dot range: clean
- Verify: `46024181508`, event `pull_request`, `completed` / `success`,
  headSha `f1e8178d1cca1794491cfb09a524bbcc6fe932ea`
- this file is not a GitHub approval and does not merge or close `003B-4C`

## Hosted Verify

All 7 jobs completed successfully on the exact head:

- repository-hygiene `140591183069`
- media-broker `140591283490`
- media-broker-pid1 `140591283336`
- backend `140591283359`
- frontend `140591283373`
- productive-routes-real-e2e `140591283472`
- unified-access-real-e2e `140591283413`

Focused evidence:

- `media-broker` passed 85 regular tests, including
  `reconcile::tests::terminating_job_is_quarantined_after_restart_with_absent_runtime
  ... ok`; 0 failed. Format, clippy, dependency-license, CycloneDX SBOM, and
  HIGH/CRITICAL CVE gates also completed successfully with the lockfile.
- `media-broker-pid1` passed
  `dbus::tests::pid1_terminating_job_is_quarantined_after_restart_with_absent_units
  ... ok` for JobId `[0x30; 16]`; its PID 1 suite reported 39 passed and 0
  failed.
- The run and every listed job concluded `success`. No cancelled or skipped
  job was counted as passing.

## Why this cut

The PR title/body, STATUS next-cut statement, progress Terminating restart
heading, meta, ADR-001 restart-before-admission and fail-closed mismatch /
quarantine contract, and plan agree on the narrow property under review.
Reopening a `Terminating` job must remain `RecoveryPending`; an absent runtime
is a mismatch because `Terminating` expects one, so reconciliation must
quarantine the job and keep global admission closed.

The plan still records `MEDIA-NORMALIZE-003B-4C` as `[ ]`. The next cut is
restart after `Terminal`; this PR does not attest later durable states, socket
families, `Ready`, HTTP, or completion of the aggregate gates.

## Security review

- The PID 1 regression reaches durable `Terminating`, drops and reopens the
  store, proves `RecoveryPending`, and rejects allocation of `[0x31; 16]` with
  `AdmissionClosed` before inventory reconciliation or runtime effects.
- The attested job identity is fixed as `[0x30; 16]`.
  `TransientUnits::derive` derives the exact `.mount`, worker unit, `Where`,
  and `ExecStart` internally from that `JobId` plus root-owned configuration.
  The diff adds no client-supplied command, executable, path, `Where`, unit
  name, or D-Bus property.
- The harness directly attests both exact derived units as `NotLoaded`.
  `Pid1AbsentUnits::enumerate` returns an empty inventory only for the dual
  `NotLoaded` tuple; every other tuple is `Unavailable`. Its `terminate`
  implementation always returns `Unavailable`, so a clean report cannot be
  manufactured by a hidden termination.
- `JobState::Terminating` satisfies `expects_runtime`. Empty inventory
  therefore resolves to `Absent`, records a mismatch, transitions the record
  to `Quarantined`, persists `ReconciliationMismatch`, and leaves admission
  blocked.
- The consistent clean path is unchanged: `Allocated | InputSealed` with
  `Absent` remains clean without quarantine. Existing pre-runtime restart
  behavior therefore remains intact.
- Restart after `Terminal`, socket-family attestation, `Ready`, and HTTP
  remain unattested. `ProtectHome`, `RestrictAddressFamilies`, and `CPUQuota`
  remain explicitly out of scope.
- The full three-dot diff adds two narrow tests and SDD status updates. It adds
  no secret or credential, HTTP route, capability `Ready`, Java pin/retarget,
  production execution surface, deploy, tag, or publish behavior.
- `backend/media-broker/src/lib.rs` still has
  `#![forbid(unsafe_code)]`. No unsafe production code was introduced.
- STATUS, progress, meta, and plan retain `003B-4B-3`, `003B-4B-4`,
  `003B-4C`, `003B-4`, TASK-005, issue #7, `Ready`, and media HTTP as open or
  out of scope.

## Open residuals

- restart/reconciliation after `Terminal` and the remaining durable states
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

APPROVED for exact head `f1e8178d1cca1794491cfb09a524bbcc6fe932ea`
over base `2968857bafd7ec08c31c580c23d269df0454e475`. Verify
`46024181508` is independently confirmed final 7/7 on that head, including
both the unit-level and PID 1 Terminating restart regressions. This is not a
GitHub approval and does not merge or close `003B-4C`; `Terminal` onward,
sockets, `Ready`, and HTTP remain unattested.
