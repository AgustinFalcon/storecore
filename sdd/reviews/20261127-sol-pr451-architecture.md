VERDICT: APPROVED

## Evidence identity

- provider: xAI
- model: grok-4.7-medium-fast
- effort: medium
- lane: architecture
- authorized substitute after gpt-5.6-sol-medium quota
- independent of the security lane (this review did not read the PR #451 security-lane file).
- PR: #451 OPEN, `feat(media): attest PID 1 restart with expected Active units terminates to Terminal`
- URL: https://github.com/AgustinFalcon/storecore/pull/451
- branch: `feat/media-broker-4c-restart-active-inventory-20261127`
- base branch: `master`
- head SHA: `207f7493eb5f1df79580d69b5216f8ca9bb72572`
- base SHA: `46454e21ebb0d5c8b5d9ef328d8cfcfda46cba4a`
- exact range: `46454e21ebb0d5c8b5d9ef328d8cfcfda46cba4a...207f7493eb5f1df79580d69b5216f8ca9bb72572`
- diff identity: 4 files, 166 insertions, 3 deletions; the full three-dot
  diff was read.
- checkout HEAD was the exact PR head, the branch was unchanged, and the PR
  reports the expected exact base and head SHAs.
- `git diff --check` on the exact range exited 0 with no output.
- this file is not a GitHub approval, does not merge or retarget PR #451,
  does not retarget Java, and does not close or check off `003B-4C`,
  `003B-4B-3`, `003B-4B-4`, Ready, HTTP, or TASK-005.

## PR intent and SDD why

`gh pr view 451` reports the expected OPEN PR and a narrow evidence cut:
after a durable `Running` job whose PID 1 `.mount` and worker are still
Active, reopening the journal must stay `RecoveryPending` until reconcile;
terminate-verified inventory must leave the job `Terminal` and reopen
admission. Unexpected Active inventory, sockets, Ready, and HTTP stay out.
`003B-4C` stays open.

ADR-001 requires, before accepting jobs after a restart, an enumeration of
the journal, mounts, and units by exact identity. What is still active is
killed and reconciled, and cleanup happens only when no PID, cgroup, or
mount remains. Any discrepancy retains evidence, marks `Quarantined`, and
keeps the global gate closed until explicit intervention. Expected Active
on a job that `expects_runtime()` is therefore terminate-verified plus
`Terminal`. The `003B-4C` contract still requires real Linux harness
evidence for restart at each durable state. `MEDIA-NORMALIZE-003B-4C` in
`plan.md` remains `[ ]`.

STATUS stays `En implementación`. The next expected cut is unexpected
Active inventory and the rest of 4C. Progress contains the heading
`2026-11-27 — arranque 4C inventario Active esperado`. Meta records the
expected Active inventory cut as in implementation and says it does not
cover unexpected Active inventory or `Ready`. These documents keep
sockets, `Ready`, and media HTTP as residuals. `003B-4B-3`, `003B-4B-4`,
`003B-4C`, `003B-4`, TASK-005, and #7 stay open. This cut adds no media
HTTP.

## Hosted Verify and focused validations

Verify run `46063548747` is a completed `pull_request` run with conclusion
`success` on exact head
`207f7493eb5f1df79580d69b5216f8ca9bb72572`. All 7 jobs succeeded:

- repository-hygiene `140723310343`
- media-broker `140723401949`
- media-broker-pid1 `140723401917`
- backend `140723402019`
- frontend `140723401919`
- productive-routes-real-e2e `140723401967`
- unified-access-real-e2e `140723401988`

The exact `media-broker-pid1` log records
`pid1_running_job_with_active_units_is_terminated_after_restart ... ok`;
the test uses JobId `[0x36; 16]`. Its primary Rust result records 42
passed and 0 failed. The exact `media-broker` log records
`expected_active_runtime_is_terminated_and_made_terminal ... ok` and
`unexpected_runtime_is_terminated_quarantined_and_blocks_admission ... ok`;
its primary result records 87 passed and 0 failed. No cancelled job or
step is counted as a pass. Stale heads `820fb92` and `900e284` are not
this candidate.

## Architecture review

- The PID 1 test durably creates `Allocated`, transitions through
  `InputSealed` and `Starting` to `Running`, starts the derived `.mount`
  and worker through PID 1, drops the store, and reopens. That reopen is
  `RecoveryPending`. Allocation of JobId `[0x37; 16]` fails with
  `AdmissionClosed` before reconciliation. `BrokerStore::allocate` rejects
  every admission state other than `Open`, and `open` always starts at
  `RecoveryPending`.
- `TransientUnits::derive` reconstructs the `.mount` and worker identities
  from the durable JobId and internal root-owned configuration. The client
  supplies no unit names, paths, commands, or systemd properties. PID 1
  attests both derived units `Active` before reconcile.
- `Pid1ExpectedActive` maps only the exact pair `(Mount Active, Worker
  Active)` to one `ObservedJob` in `RuntimeState::Active`. Every other
  pair is `Unavailable`. `terminate` stops the worker and then the mount,
  and returns `RuntimeState::Terminal` only when both stops are
  `Inactive` or `Failed`; otherwise it returns `Unavailable`. Partial or
  unreadable evidence cannot become a verified termination.
- `JobState::Running` does `expects_runtime()`. That predicate is only
  `Starting | Running | Terminating`. Observed `Active` on such a record
  takes `terminate_verified`, transitions the job to `Terminal`, and, with
  no mismatch, `finish_reconciliation` leaves admission `Open`. The PID 1
  report is `Clean`, with one termination and one transition, and both
  units then attest `NotLoaded`.
- This is the opposite of `Running` plus `Absent`. That pair records
  `ReconciliationMismatch`, quarantines the job, and keeps admission
  closed. A pre-existing fake-adapter test already proves expected Active
  becomes `Terminal` and `Open`. Unexpected Active (`Allocated` plus
  `Active`) stays on the non-running path: terminate, quarantine, and
  `AdmissionBlocked`. This cut does not attest that residual on PID 1.
- `pid1_assert_expected_active_terminated` and `Pid1ExpectedActive` live
  only inside `dbus.rs` `mod tests`.
- `src/lib.rs` still declares `#![forbid(unsafe_code)]`. The exact diff
  changes only `dbus.rs`, STATUS, progress, and meta. It changes no
  `Cargo.toml`, Java/Kotlin, HTTP, Ready, migration, or plan checkbox and
  performs no Java retarget.
- The cut remains narrow and honest. Unexpected Active inventory, sockets,
  `Ready`, and HTTP remain residuals. `003B-4C` remains open.

## P0-P3

- P0: none
- P1: none
- P2: none
- P3: none

## Conclusion

The exact head independently demonstrates the required fail-closed
behavior for expected Active inventory: the attested reopen stays
`RecoveryPending`, allocation is closed before reconcile, exact PID 1
Active evidence comes from internally derived unit identities, verified
termination of worker then mount leaves the `Running` job `Terminal` with
admission `Open`, and anything short of both units stopped stays
`Unavailable`. The SDD accurately retains the remaining gates.
Architecture verdict: APPROVED with no P0–P3.
