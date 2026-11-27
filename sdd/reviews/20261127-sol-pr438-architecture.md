VERDICT: APPROVED

## Evidence identity

- provider: OpenAI
- model: gpt-5.6-sol-medium
- effort: medium
- lane: architecture
- independent of the security lane (this review did not read the PR #438 security-lane file).
- PR: #438 OPEN, `feat(media): attest PID 1 restart after Starting with absent units quarantines`
- URL: https://github.com/AgustinFalcon/storecore/pull/438
- branch: `feat/media-broker-4c-restart-starting-20261127`
- base branch: `master`
- head SHA: `966f98625cf4ea1996daf46a372a303b3ac78fb8`
- base SHA: `55a50be3e34db345e8931cea5ffffd66f68ae132`
- exact range: `55a50be3e34db345e8931cea5ffffd66f68ae132...966f98625cf4ea1996daf46a372a303b3ac78fb8`
- diff identity: 4 files, 160 insertions, 3 deletions; the full three-dot
  diff was read.
- checkout HEAD was the exact PR head, the branch was unchanged, and the PR
  reports the expected exact base and head SHAs.
- `git diff --check` on the exact range exited 0 with no output.
- this file is not a GitHub approval, does not merge or retarget PR #438,
  does not retarget Java, and does not close or check off `003B-4C`,
  `003B-4B-3`, `003B-4B-4`, Ready, HTTP, or TASK-005.

## PR intent and SDD why

`gh pr view 438` reports the expected OPEN PR and a narrow evidence cut:
after persisting `Starting`, reopening the journal must hold admission in
`RecoveryPending`; PID 1 must report neither derived unit loaded; and absent
runtime must be treated as a mismatch that quarantines the job and keeps
admission closed.

ADR-001 requires recovery after every durable transition and requires
mismatch/quarantine when the durable journal disagrees with runtime. Its
`003B-4C` contract requires real Linux harness evidence for restart at each
durable state. The technical spec retains that requirement, and the canonical
plan still has `MEDIA-NORMALIZE-003B-4C` as `[ ]`.

STATUS remains `En implementación` and names restart after `Running` as the
next cut. Progress contains the new
`2026-11-27 — arranque 4C reinicio tras Starting` heading. Meta records the
Starting cut as in implementation. These documents preserve later durable
restarts, socket-family evidence, `Ready`, and media HTTP as residuals.

## Hosted Verify and focused validations

Verify run `45944646863` is a completed `pull_request` run with conclusion
`success` on exact head
`966f98625cf4ea1996daf46a372a303b3ac78fb8`. All 7 jobs succeeded:

- repository-hygiene `140326456434`
- media-broker `140326512564`
- media-broker-pid1 `140326512650`
- backend `140326512743`
- frontend `140326512609`
- productive-routes-real-e2e `140326512618`
- unified-access-real-e2e `140326512579`

The exact `media-broker-pid1` log records
`pid1_starting_job_is_quarantined_after_restart_with_absent_units ... ok`;
the test uses JobId `[0x2c; 16]`. Its Rust result records 37 passed and 0
failed. The exact `media-broker` log records
`starting_job_is_quarantined_after_restart_with_absent_runtime ... ok`;
its primary result records 83 passed and 0 failed. No cancelled job or step is
counted as a pass.

## Architecture review

- The PID 1 test durably creates `Allocated`, transitions through
  `InputSealed` to `Starting`, drops the store, and reopens the journal. The
  reopened store is `RecoveryPending`; allocation of JobId `[0x2d; 16]`
  fails with `AdmissionClosed` before reconciliation.
- `TransientUnits::derive` reconstructs the `.mount` and worker identities
  from the durable JobId and internal root-owned configuration. The client
  supplies no unit names, paths, commands, or systemd properties. PID 1
  reports both derived units as `NotLoaded`.
- `Pid1AbsentUnits` maps only the exact pair `(Mount NotLoaded, Worker
  NotLoaded)` to an empty inventory. Every other pair is `Unavailable`, and
  `terminate` is always `Unavailable`; partial or unreadable evidence cannot
  become clean absence.
- `JobState::Starting` is a closed state whose `expects_runtime()` result is
  true. Therefore `RuntimeState::Absent` follows the mismatch branch:
  intervention is persisted, the job transitions to `Quarantined`, and
  `finish_reconciliation(true)` leaves admission blocked by
  `ReconciliationMismatch`.
- This is intentionally opposite to `Allocated | InputSealed` with absent
  runtime. Those two pre-runtime states remain consistent, preserve their
  durable record, and reopen admission after a clean reconciliation.
- The independent fake-adapter unit test proves reopen, absent inventory,
  mismatch count, quarantine, `AdmissionBlocked`, and rejection of a later
  allocation without relying on the PID 1 integration.
- `src/lib.rs` still declares `#![forbid(unsafe_code)]`. The exact diff changes
  only `dbus.rs`, `reconcile.rs`, STATUS, and progress. It changes no
  `Cargo.toml`, Java/Kotlin, HTTP, Ready, migration, meta, or plan checkbox and
  performs no Java retarget.
- The cut remains narrow and honest. Restart after `Running` and later durable
  transitions, sockets, `Ready`, and HTTP remain residuals; `003B-4C` remains
  open.

## P0-P3

- P0: none
- P1: none
- P2: none
- P3: none

## Conclusion

The exact head independently demonstrates the required fail-closed behavior
after a durable `Starting` transition: admission remains closed during
recovery, exact PID 1 absence is established from internally derived unit
identities, the runtime mismatch is persisted and quarantined, and admission
does not reopen. The SDD accurately retains the remaining gates. Architecture
verdict: APPROVED with no P0-P3.
