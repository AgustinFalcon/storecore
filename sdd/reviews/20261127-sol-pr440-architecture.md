VERDICT: APPROVED

## Evidence identity

- provider: OpenAI
- model: gpt-5.6-sol-medium
- effort: medium
- lane: architecture
- independent of the security lane (this review did not read the PR #440 security-lane file).
- PR: #440 OPEN, `feat(media): attest PID 1 restart after Running with absent units quarantines`
- URL: https://github.com/AgustinFalcon/storecore/pull/440
- branch: `feat/media-broker-4c-restart-running-20261127`
- base branch: `master`
- head SHA: `dd2de3651427c93ab496aad35a1fa30529b9bfd2`
- base SHA: `2d013752f3b9ca2fe929c456e2d7082438dc4ea9`
- exact range: `2d013752f3b9ca2fe929c456e2d7082438dc4ea9...dd2de3651427c93ab496aad35a1fa30529b9bfd2`
- diff identity: 4 files, 184 insertions, 2 deletions; the full three-dot
  diff was read.
- checkout HEAD was the exact PR head, the branch was unchanged, and the PR
  reports the expected exact base and head SHAs.
- `git diff --check` on the exact range exited 0 with no output.
- this file is not a GitHub approval, does not merge or retarget PR #440,
  does not retarget Java, and does not close or check off `003B-4C`,
  `003B-4B-3`, `003B-4B-4`, Ready, HTTP, or TASK-005.

## PR intent and SDD why

`gh pr view 440` reports the expected OPEN PR and a narrow evidence cut:
after persisting `Running`, reopening the journal must hold admission in
`RecoveryPending`; PID 1 must report neither derived unit loaded; and absent
runtime must be treated as a mismatch that quarantines the job and keeps
admission closed.

ADR-001 requires recovery after every durable transition and requires
mismatch/quarantine when the durable journal disagrees with runtime. Its
`003B-4C` contract requires real Linux harness evidence for restart at each
durable state. The canonical plan still has
`MEDIA-NORMALIZE-003B-4C` as `[ ]`.

STATUS remains `En implementación` and names restart after `Terminating` as
the next cut. Progress contains the new
`2026-11-27 — arranque 4C reinicio tras Running` heading. Meta records the
Running cut as in implementation. These documents preserve later durable
restarts, socket-family evidence, `Ready`, and media HTTP as residuals.

## Hosted Verify and focused validations

Verify run `45950722247` is a completed `pull_request` run with conclusion
`success` on exact head
`dd2de3651427c93ab496aad35a1fa30529b9bfd2`. All 7 jobs succeeded:

- repository-hygiene `140345678536`
- media-broker `140345755590`
- media-broker-pid1 `140345755578`
- backend `140345755668`
- frontend `140345755663`
- productive-routes-real-e2e `140345755499`
- unified-access-real-e2e `140345755589`

The exact `media-broker-pid1` log records
`pid1_running_job_is_quarantined_after_restart_with_absent_units ... ok`;
the test uses JobId `[0x2e; 16]`. Its Rust result records 38 passed and 0
failed. The exact `media-broker` log records
`running_job_is_quarantined_after_restart_with_absent_runtime ... ok`;
its primary result records 84 passed and 0 failed. No cancelled job or step is
counted as a pass. The earlier 7/7 run on stale head `ccfdf839` is not treated
as evidence for this candidate.

## Architecture review

- The PID 1 test durably creates `Allocated`, transitions through
  `InputSealed` and `Starting` to `Running`, drops the store, and reopens the
  journal. The reopened store is `RecoveryPending`; allocation of JobId
  `[0x2f; 16]` fails with `AdmissionClosed` before reconciliation.
- `TransientUnits::derive` reconstructs the `.mount` and worker identities
  from the durable JobId and internal root-owned configuration. The client
  supplies no unit names, paths, commands, or systemd properties. PID 1
  reports both derived units as `NotLoaded`.
- `Pid1AbsentUnits` maps only the exact pair `(Mount NotLoaded, Worker
  NotLoaded)` to an empty inventory. Every other pair is `Unavailable`, and
  `terminate` is always `Unavailable`; partial or unreadable evidence cannot
  become clean absence.
- `JobState::Running` is a closed state whose `expects_runtime()` result is
  true. Therefore `RuntimeState::Absent` follows the mismatch branch:
  intervention is persisted, the job transitions to `Quarantined`, and
  `finish_reconciliation(true)` leaves admission blocked by
  `ReconciliationMismatch`.
- This follows the same fail-closed path as `Starting` with absent runtime and
  is intentionally opposite to `Allocated | InputSealed` with absent runtime.
  Those two pre-runtime states remain consistent, preserve their durable
  record, and reopen admission after a clean reconciliation.
- The independent fake-adapter unit test proves reopen, absent inventory,
  mismatch count, quarantine, `AdmissionBlocked`, and rejection of a later
  allocation without relying on the PID 1 integration.
- `pid1_require_root` is test-only and only consolidates the existing PID 1
  and effective-root harness preconditions; it changes no production path.
- `src/lib.rs` still declares `#![forbid(unsafe_code)]`. The exact diff changes
  only `dbus.rs`, `reconcile.rs`, STATUS, and progress. It changes no
  `Cargo.toml`, Java/Kotlin, HTTP, Ready, migration, meta, or plan checkbox and
  performs no Java retarget.
- The cut remains narrow and honest. Restart after `Terminating` and later
  durable transitions, sockets, `Ready`, and HTTP remain residuals;
  `003B-4C` remains open.

## P0-P3

- P0: none
- P1: none
- P2: none
- P3: none

## Conclusion

The exact head independently demonstrates the required fail-closed behavior
after a durable `Running` transition: admission remains closed during
recovery, exact PID 1 absence is established from internally derived unit
identities, the runtime mismatch is persisted and quarantined, and admission
does not reopen. The SDD accurately retains the remaining gates. Architecture
verdict: APPROVED with no P0-P3.
