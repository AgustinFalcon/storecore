VERDICT: APPROVED

## Evidence identity

- provider: xAI
- model: grok-4.7-medium-fast
- effort: medium
- lane: architecture
- authorized substitute after gpt-5.6-sol-medium quota
- independent of the security lane (this review did not read the PR #448 security-lane file).
- PR: #448 OPEN, `feat(media): attest PID 1 restart after Quarantined with absent units stays blocked`
- URL: https://github.com/AgustinFalcon/storecore/pull/448
- branch: `feat/media-broker-4c-restart-quarantined-20261127`
- base branch: `master`
- head SHA: `db8182e134ccf4b9accba0f25021c22bc4e45925`
- base SHA: `0201151f98a57a272b62a1053b41c6187c3fe5de`
- exact range: `0201151f98a57a272b62a1053b41c6187c3fe5de...db8182e134ccf4b9accba0f25021c22bc4e45925`
- diff identity: 5 files, 135 insertions, 5 deletions; the full three-dot
  diff was read.
- checkout HEAD was the exact PR head, the branch was unchanged, and the PR
  reports the expected exact base and head SHAs.
- `git diff --check` on the exact range exited 0 with no output.
- this file is not a GitHub approval, does not merge or retarget PR #448,
  does not retarget Java, and does not close or check off `003B-4C`,
  `003B-4B-3`, `003B-4B-4`, Ready, HTTP, or TASK-005.

## PR intent and SDD why

`gh pr view 448` reports the expected OPEN PR and a narrow evidence cut:
after a durable `Quarantined` state, reopening the journal must stay
`RecoveryPending` until reconcile; PID 1 must have neither the derived
`.mount` nor the worker loaded; and an absent inventory must keep the job
quarantined and admission closed.

ADR-001 requires restart at every durable transition and a mismatch latch:
any discrepancy retains evidence, marks `Quarantined`, and keeps the global
gate closed until explicit intervention. The `003B-4C` contract still
requires real Linux harness evidence for restart at each durable state.
`MEDIA-NORMALIZE-003B-4C` in `plan.md` remains `[ ]`.

STATUS stays `En implementación`. The next expected cut is Active inventory
and the rest of 4C. Progress contains the heading
`2026-11-27 — arranque 4C reinicio tras Quarantined`. Meta records the
Quarantined restart as in implementation and says it does not cover expected
Active inventory or `Ready`. These documents keep sockets, `Ready`, and media
HTTP as residuals. `003B-4B-3`, `003B-4B-4`, `003B-4C`, `003B-4`, TASK-005,
and #7 stay open. This cut adds no media HTTP.

## Hosted Verify and focused validations

Verify run `46054038347` is a completed `pull_request` run with conclusion
`success` on exact head
`db8182e134ccf4b9accba0f25021c22bc4e45925`. All 7 jobs succeeded:

- repository-hygiene `140692083197`
- media-broker `140692162015`
- media-broker-pid1 `140692162022`
- backend `140692161985`
- frontend `140692162046`
- productive-routes-real-e2e `140692162092`
- unified-access-real-e2e `140692162021`

The exact `media-broker-pid1` log records
`pid1_quarantined_job_stays_blocked_after_restart_with_absent_units ... ok`;
the test uses JobId `[0x34; 16]`. Its primary Rust result records 41 passed
and 0 failed. The exact `media-broker` log records
`quarantined_job_stays_blocked_after_restart_with_absent_runtime ... ok`;
its primary result records 87 passed and 0 failed. No cancelled job or step
is counted as a pass.

## Architecture review

- The PID 1 test durably creates `Allocated`, transitions through
  `InputSealed` to `Starting`, drops the store, and reopens. That first
  reopen of `Starting` plus absent units quarantines the job. The second
  reopen is the attested restart: admission is `RecoveryPending`, and
  allocation of JobId `[0x35; 16]` fails with `AdmissionClosed` before
  reconciliation. `BrokerStore::allocate` rejects every admission state other
  than `Open`, and `open` always starts at `RecoveryPending`.
- `TransientUnits::derive` reconstructs the `.mount` and worker identities
  from the durable JobId and internal root-owned configuration. The client
  supplies no unit names, paths, commands, or systemd properties. PID 1
  reports both derived units as `NotLoaded`.
- `Pid1AbsentUnits` maps only the exact pair `(Mount NotLoaded, Worker
  NotLoaded)` to an empty inventory. Every other pair is `Unavailable`, and
  `terminate` is always `Unavailable`; partial or unreadable evidence cannot
  become clean absence.
- `JobState::Quarantined` does not `expects_runtime()`. That predicate is
  only `Starting | Running | Terminating`. Absent runtime is consistent only
  for `Allocated | InputSealed` plus `Absent`, and for `Terminal` plus
  `Absent | Terminal`. The second reconcile therefore takes
  `reconcile_non_running`, records `ReconciliationMismatch`, leaves the job
  `Quarantined` (it does not transition an already quarantined record), and
  finishes `AdmissionBlocked` with `ReconciliationMismatch`. A later
  allocation stays `AdmissionClosed`.
- This is the opposite of `Terminal` plus `Absent`. That pair is consistent,
  `pid1_assert_absent_clean` reports `Clean` and `Open`, and the job stays
  `Terminal`. A quarantined job with an empty inventory does not reopen the
  gate.
- The independent fake-adapter unit test proves the same sequence without
  PID 1: the first absent reconcile quarantines `Starting`; the second reopen
  is `RecoveryPending`; the second reconcile stays `AdmissionBlocked` with
  the job `Quarantined` and `ReconciliationMismatch`; a later allocation is
  `AdmissionClosed`.
- `src/lib.rs` still declares `#![forbid(unsafe_code)]`. The exact diff
  changes only `dbus.rs`, `reconcile.rs`, STATUS, progress, and meta. It
  changes no `Cargo.toml`, Java/Kotlin, HTTP, Ready, migration, or plan
  checkbox and performs no Java retarget.
- The cut remains narrow and honest. Expected Active inventory terminate,
  sockets, `Ready`, and HTTP remain residuals. `003B-4C` remains open.

## P0-P3

- P0: none
- P1: none
- P2: none
- P3: none

## Conclusion

The exact head independently demonstrates the required fail-closed behavior
after a durable `Quarantined` state: the attested reopen stays
`RecoveryPending`, allocation is closed before reconcile, exact PID 1 absence
comes from internally derived unit identities, the absent inventory records a
mismatch without clearing quarantine, and admission does not reopen. The SDD
accurately retains the remaining gates. Architecture verdict: APPROVED with
no P0–P3.
