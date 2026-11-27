VERDICT: APPROVED

## Evidence identity

- provider: xAI
- model: grok-4.7-medium-fast
- effort: medium
- lane: security
- authorized substitute after gpt-5.6-sol-medium quota
- independent of the architecture lane (this review did not read the PR #446 architecture-lane file).
- PR: #446 OPEN, `feat(media): attest PID 1 restart after Terminal with absent units stays clean`
- URL: https://github.com/AgustinFalcon/storecore/pull/446
- branch: `feat/media-broker-4c-restart-terminal-20261127`
- base branch: `master`
- head SHA: `8f220b36eea40a107a59999a5b4059cb562fcdb8`
- base SHA: `e43c70c61704fdecc3b68b11705fa5460af1c8d6`
- exact range:
  `e43c70c61704fdecc3b68b11705fa5460af1c8d6...8f220b36eea40a107a59999a5b4059cb562fcdb8`
- diff identity: 5 files, +160/-3
- files: `backend/media-broker/src/dbus.rs`,
  `backend/media-broker/src/reconcile.rs`, `sdd/STATUS.md`, WIP
  `progress.md`, WIP `meta.md`
- `git diff --check` on the exact three-dot range: clean
- Verify: `46050099421`, event `pull_request`, `completed` / `success`,
  headSha `8f220b36eea40a107a59999a5b4059cb562fcdb8`
- worktree left on `feat/media-broker-4c-restart-terminal-20261127` at that head
- this file is not a GitHub approval and does not merge or close `003B-4C`

## Hosted Verify

All 7 jobs completed successfully on the exact head:

- repository-hygiene `140678986375`
- media-broker `140679080207`
- media-broker-pid1 `140679080141`
- backend `140679080148`
- frontend `140679080173`
- productive-routes-real-e2e `140679080176`
- unified-access-real-e2e `140679080213`

Focused evidence:

- `media-broker` passed 86 regular tests, including
  `reconcile::tests::terminal_job_survives_restart_with_absent_runtime
  ... ok`; 0 failed; 40 ignored. Format, clippy, dependency-license,
  CycloneDX SBOM, and HIGH/CRITICAL CVE gates also completed successfully
  with the lockfile.
- `media-broker-pid1` passed
  `dbus::tests::pid1_terminal_job_survives_restart_with_absent_units
  ... ok` for JobId `[0x32; 16]`; its PID 1 suite reported 40 passed and 0
  failed. A later result in the same step was 1 passed and 0 failed.
- The run and every listed job concluded `success`. No cancelled or skipped
  job was counted as passing.

## Why this cut

The PR title/body, STATUS next-cut statement (`Quarantined` and the remaining
durable transitions), progress Terminal restart heading, meta, ADR-001
restart-before-admission, and plan agree on the narrow property under review.
Reopening a `Terminal` job must remain `RecoveryPending` until reconcile. PID 1
has neither the derived `.mount` nor the worker loaded. Because `Terminal` does
not expect a runtime, an absent inventory is consistent: the job stays
`Terminal` and admission reopens.

The plan still records `MEDIA-NORMALIZE-003B-4C` as `[ ]`. The next cut is
restart after `Quarantined`; this PR does not attest that state, socket
families, `Ready`, HTTP, or completion of the aggregate gates. `003B-4B-3` and
`003B-4B-4` stay `[ ]`.

## Security review

- The PID 1 regression reaches durable `Terminal`, drops and reopens the
  store, proves `RecoveryPending`, and rejects allocation of `[0x33; 16]` with
  `AdmissionClosed` before inventory attestation or reconciliation effects.
- The attested job identity is fixed as `[0x32; 16]`.
  `TransientUnits::derive` derives the exact `.mount`, worker unit, and
  `Where` internally from that `JobId` plus root-owned configuration. The
  worker principal is not part of either unit name. The diff adds no
  client-supplied command, `ExecStart`, path, `Where`, unit name, or D-Bus
  property.
- The harness directly attests both exact derived units as `NotLoaded`.
  `Pid1AbsentUnits::enumerate` is unchanged and returns an empty inventory
  only for the dual `NotLoaded` tuple; every other tuple is `Unavailable`.
  Its `terminate` implementation always returns `Unavailable`, so a clean
  report cannot be manufactured by a hidden kill.
- `JobState::expects_runtime` is unchanged and is true only for
  `Starting | Running | Terminating`. `Terminal` is outside that set.
  `reconcile_non_running` treats `Terminal` with `Absent` or `Terminal` as
  consistent and returns without quarantine. Empty inventory therefore
  resolves to `Absent`, the report is `Clean`, admission becomes `Open`, and
  the durable record stays `Terminal`.
- `Starting | Running | Terminating` with `Absent` remains the mismatch path:
  `record_mismatch`, transition to `Quarantined`, and admission blocked.
  That production match was not edited. `Terminal` observed `Active` is still
  outside the consistent tuple, so a live unit on a terminal record still
  mismatches, attempts a verified terminate, and quarantines.
- `Quarantined` restart, socket-family attestation, `Ready`, and HTTP remain
  unattested. `ProtectHome`, `RestrictAddressFamilies`, and `CPUQuota` remain
  explicitly out of scope.
- The full three-dot diff adds two narrow tests and SDD status updates. It
  adds no secret or credential, HTTP route, capability `Ready`, Java
  pin/retarget, production execution surface, deploy, tag, or publish
  behavior. CI still pins Temurin `21.0.13+9`.
- `backend/media-broker/src/lib.rs` still has
  `#![forbid(unsafe_code)]`. No unsafe production code was introduced.
- STATUS, progress, meta, and plan retain `003B-4B-3`, `003B-4B-4`,
  `003B-4C`, `003B-4`, TASK-005, issue #7, `Ready`, and media HTTP as open or
  out of scope.

## Open residuals

- restart/reconciliation after `Quarantined` and any remaining durable states
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

APPROVED for exact head `8f220b36eea40a107a59999a5b4059cb562fcdb8`
over base `e43c70c61704fdecc3b68b11705fa5460af1c8d6`. Verify
`46050099421` is independently confirmed final 7/7 on that head, including
both the unit-level and PID 1 Terminal restart regressions. This is not a
GitHub approval and does not merge or close `003B-4C`; `Quarantined` onward,
sockets, `Ready`, and HTTP remain unattested.
