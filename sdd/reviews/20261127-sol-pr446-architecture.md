VERDICT: APPROVED

## Evidence identity

- provider: xAI
- model: grok-4.7-medium-fast
- effort: medium
- lane: architecture
- authorized substitute after gpt-5.6-sol-medium quota
- independent of the security lane (this review did not read the PR #446 security-lane file).
- PR: #446 OPEN, `feat(media): attest PID 1 restart after Terminal with absent units stays clean`
- URL: https://github.com/AgustinFalcon/storecore/pull/446
- branch: `feat/media-broker-4c-restart-terminal-20261127`
- base branch: `master`
- head SHA: `8f220b36eea40a107a59999a5b4059cb562fcdb8`
- base SHA: `e43c70c61704fdecc3b68b11705fa5460af1c8d6`
- exact range: `e43c70c61704fdecc3b68b11705fa5460af1c8d6...8f220b36eea40a107a59999a5b4059cb562fcdb8`
- diff identity: 5 files, 160 insertions, 3 deletions; the full three-dot
  diff was read.
- checkout HEAD was the exact PR head, the branch was unchanged, and the PR
  reports the expected exact base and head SHAs.
- `git diff --check` on the exact range exited 0 with no output.
- this file is not a GitHub approval, does not merge or retarget PR #446,
  does not retarget Java, and does not close or check off `003B-4C`,
  `003B-4B-3`, `003B-4B-4`, Ready, HTTP, or TASK-005.

## PR intent and SDD why

`gh pr view 446` reports the expected OPEN PR and a narrow evidence cut:
after persisting `Terminal`, reopening the journal must hold admission in
`RecoveryPending`; PID 1 must report neither derived unit loaded; and an
absent inventory must leave the job `Terminal` and reopen admission.

ADR-001 requires restart evidence at every durable transition
(`reinicio en cada transición durable`) and requires the broker to enumerate
journal, mounts, and units before accepting work after a restart. A real
mismatch quarantines and keeps the global gate closed. `Terminal` with a
proven-absent runtime is the consistent case, not a mismatch. The `003B-4C`
contract still requires the full Linux harness, including restart on every
durable state. `plan.md` still has `MEDIA-NORMALIZE-003B-4C` as `[ ]`.

STATUS remains `En implementación` and names restart after `Quarantined` as
the next cut. It records restart after `Terminal` as attested and states that
this document does not close `003B-4C`. Progress contains the new
`2026-11-27 — arranque 4C reinicio tras Terminal` heading. Meta records the
Terminal cut as in implementation and says it does not cover `Quarantined`
or `Ready`. These documents preserve the Quarantined restart, socket-family
evidence, `Ready`, and media HTTP as residuals.

## Hosted Verify and focused validations

Verify run `46050099421` is a completed `pull_request` run with conclusion
`success` on exact head
`8f220b36eea40a107a59999a5b4059cb562fcdb8`. All 7 jobs succeeded:

- repository-hygiene `140678986375`
- media-broker `140679080207`
- media-broker-pid1 `140679080141`
- backend `140679080148`
- frontend `140679080173`
- productive-routes-real-e2e `140679080176`
- unified-access-real-e2e `140679080213`

The exact `media-broker-pid1` log records
`pid1_terminal_job_survives_restart_with_absent_units ... ok`;
the test uses JobId `[0x32;16]`. Its primary result records 40 passed and 0
failed. The exact `media-broker` log records
`terminal_job_survives_restart_with_absent_runtime ... ok`;
its primary result records 86 passed and 0 failed. No cancelled job or step is
counted as a pass.

## Architecture review

- The PID 1 test durably walks `Allocated`, `InputSealed`, `Starting`,
  `Running`, and `Terminating` into `Terminal` for JobId `[0x32;16]`, drops
  the store, and reopens the journal. The reopened store is
  `RecoveryPending`. Allocation of JobId `[0x33;16]` fails with
  `AdmissionClosed` before reconciliation. `BrokerStore::open` always enters
  `RecoveryPending`, and `allocate` rejects every admission other than
  `Open`.
- `TransientUnits::derive` reconstructs the `.mount` and worker identities
  from the durable JobId, the internal mount root, the worker principal, and
  the approved runtime. The client supplies no unit names, paths, commands,
  or systemd properties. PID 1 `attest` of both derived units is
  `SystemdError::NotLoaded`.
- `Pid1AbsentUnits` maps only the exact pair `(Mount NotLoaded, Worker
  NotLoaded)` to an empty inventory. Every other pair is `Unavailable`, and
  `terminate` is always `Unavailable`. Partial or unreadable evidence cannot
  become clean absence, and this adapter cannot invent a successful stop.
- `JobState::Terminal` is a closed state whose `expects_runtime()` result is
  false. `expects_runtime()` is true only for `Starting | Running |
  Terminating`. In `reconcile_non_running`, `(Terminal, Absent | Terminal)`
  is consistent: no mismatch, no quarantine, and no transition. With an empty
  inventory, `finish_reconciliation(false)` reopens admission. The job record
  stays `Terminal`.
- That outcome is the opposite of `Starting | Running | Terminating` plus
  `Absent`. Those states take the mismatch branch, persist `Quarantined`, and
  leave admission blocked by `ReconciliationMismatch`. The same
  `Pid1AbsentUnits` adapter is reused; `pid1_assert_absent_clean` only
  changes the expected report, admission, and durable state.
- `pid1_assert_absent_clean` lives in `dbus.rs` `mod tests` (`#[cfg(test)]`).
  It does not change production. This cut adds no production reconcile or
  D-Bus behavior; it locks the existing closed-state rule under a fake
  inventory and under PID 1.
- The in-process test reaches `Terminal` on the allowed `Running → Terminal`
  edge, reopens to `RecoveryPending`, reconciles an empty `FakeAdapter`, and
  requires `ReconcileStatus::Clean`, `AdmissionStatus::Open`, and an unchanged
  `Terminal` record. The PID 1 test is the one that walks `Terminating` and
  rejects the second allocate before reconcile.
- `src/lib.rs` still declares `#![forbid(unsafe_code)]`. The exact diff changes
  only `dbus.rs`, `reconcile.rs`, STATUS, progress, and meta. It changes no
  `Cargo.toml`, Java/Kotlin, HTTP route, Ready assignment, migration, or plan
  checkbox and performs no Java retarget.
- The cut remains narrow and honest. Restart after `Quarantined`,
  active-inventory terminate paths, sockets, `Ready`, and HTTP remain
  residuals. `003B-4C` remains open.

## P0-P3

- P0: none
- P1: none
- P2: none
- P3: none

## Conclusion

The exact head independently demonstrates the required recovery behavior
after a durable `Terminal` transition: admission stays closed until
reconcile, exact PID 1 absence is established from internally derived unit
identities, an empty inventory is consistent, the job remains `Terminal`,
and admission reopens. The SDD accurately retains the remaining gates.
Architecture verdict: APPROVED with no P0-P3.
