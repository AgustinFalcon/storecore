VERDICT: APPROVED

## Evidence identity

- provider: OpenAI
- model: gpt-5.6-sol-medium
- effort: medium
- lane: architecture
- independent of the security lane (this review did not read the PR #442 security-lane file).
- PR: #442 OPEN, `feat(media): attest PID 1 restart after Terminating with absent units quarantines`
- URL: https://github.com/AgustinFalcon/storecore/pull/442
- branch: `feat/media-broker-4c-restart-terminating-20261127`
- base branch: `master`
- head SHA: `f1e8178d1cca1794491cfb09a524bbcc6fe932ea`
- base SHA: `2968857bafd7ec08c31c580c23d269df0454e475`
- exact range: `2968857bafd7ec08c31c580c23d269df0454e475...f1e8178d1cca1794491cfb09a524bbcc6fe932ea`
- diff identity: 5 files, 166 insertions, 4 deletions; the full three-dot
  diff was read.
- checkout HEAD was the exact PR head, the branch was unchanged, and the PR
  reports the expected exact base and head SHAs.
- `git diff --check` on the exact range exited 0 with no output.
- this file is not a GitHub approval, does not merge or retarget PR #442,
  does not retarget Java, and does not close or check off `003B-4C`,
  `003B-4B-3`, `003B-4B-4`, Ready, HTTP, or TASK-005.

## PR intent and SDD why

`gh pr view 442` reports the expected OPEN PR and a narrow evidence cut:
after persisting `Terminating`, reopening the journal must hold admission in
`RecoveryPending`; PID 1 must report neither derived unit loaded; and absent
runtime must be treated as a mismatch that quarantines the job and keeps
admission closed.

ADR-001 requires recovery after every durable transition and requires
mismatch/quarantine when the durable journal disagrees with runtime. Its
`003B-4C` contract requires real Linux harness evidence for restart at each
durable state. The canonical plan still has
`MEDIA-NORMALIZE-003B-4C` as `[ ]`.

STATUS remains `En implementación` and names restart after `Terminal` as the
next cut. Progress contains the new
`2026-11-27 — arranque 4C reinicio tras Terminating` heading. Meta records the
Terminating cut as in implementation. These documents preserve Terminal and
later durable restarts, active-inventory termination paths, socket-family
evidence, `Ready`, and media HTTP as residuals.

## Hosted Verify and focused validations

Verify run `46024181508` is a completed `pull_request` run with conclusion
`success` on exact head
`f1e8178d1cca1794491cfb09a524bbcc6fe932ea`. All 7 jobs succeeded:

- repository-hygiene `140591183069`
- media-broker `140591283490`
- media-broker-pid1 `140591283336`
- backend `140591283359`
- frontend `140591283373`
- productive-routes-real-e2e `140591283472`
- unified-access-real-e2e `140591283413`

The exact `media-broker-pid1` log records
`pid1_terminating_job_is_quarantined_after_restart_with_absent_units ... ok`;
the test uses JobId `[0x30; 16]`. Its Rust result records 39 passed and 0
failed. The exact `media-broker` log records
`terminating_job_is_quarantined_after_restart_with_absent_runtime ... ok`;
its primary result records 85 passed and 0 failed. No cancelled job or step is
counted as a pass.

## Architecture review

- The PID 1 test durably creates `Allocated`, transitions through
  `InputSealed`, `Starting`, and `Running` to `Terminating`, drops the store,
  and reopens the journal. The reopened store is `RecoveryPending`; allocation
  of JobId `[0x31; 16]` fails with `AdmissionClosed` before reconciliation.
- `TransientUnits::derive` reconstructs the `.mount` and worker identities
  from the durable JobId and internal root-owned configuration. The client
  supplies no unit names, paths, commands, or systemd properties. PID 1
  reports both derived units as `NotLoaded`.
- `Pid1AbsentUnits` maps only the exact pair `(Mount NotLoaded, Worker
  NotLoaded)` to an empty inventory. Every other pair is `Unavailable`, and
  `terminate` is always `Unavailable`; partial or unreadable evidence cannot
  become clean absence.
- `JobState::Terminating` is a closed state whose `expects_runtime()` result is
  true. Therefore `RuntimeState::Absent` follows the same mismatch path as
  `Starting | Running`: intervention is persisted, the job transitions to
  `Quarantined`, and reconciliation leaves admission blocked by
  `ReconciliationMismatch`.
- This is intentionally opposite to `Allocated | InputSealed` with absent
  runtime. Those two pre-runtime states remain consistent, preserve their
  durable record, and reopen admission after clean reconciliation.
- The independent fake-adapter unit test proves reopen, absent inventory,
  mismatch count, quarantine, `AdmissionBlocked`, and rejection of a later
  allocation without relying on the PID 1 integration.
- `pid1_assert_absent_quarantine` is test-only and does not alter production
  behavior. `src/lib.rs` still declares `#![forbid(unsafe_code)]`.
- The exact diff changes only `dbus.rs`, `reconcile.rs`, STATUS, progress, and
  meta. It changes no `Cargo.toml`, Java/Kotlin, HTTP, Ready, migration, or
  plan checkbox and performs no Java retarget.
- The cut remains narrow and honest. Restart after `Terminal` and later
  durable transitions, active-inventory termination paths, sockets, `Ready`,
  and HTTP remain residuals; `003B-4C` remains open.

## P0-P3

- P0: none
- P1: none
- P2: none
- P3: none

## Conclusion

The exact head independently demonstrates the required fail-closed behavior
after a durable `Terminating` transition: admission remains closed during
recovery, exact PID 1 absence is established from internally derived unit
identities, the runtime mismatch is persisted and quarantined, and admission
does not reopen. The SDD accurately retains the remaining gates. Architecture
verdict: APPROVED with no P0-P3.
