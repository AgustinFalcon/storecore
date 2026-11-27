VERDICT: APPROVED

## Evidence identity

- provider: xAI
- model: grok-4.7-medium-fast
- effort: medium
- lane: architecture
- authorized substitute after gpt-5.6-sol-medium quota
- independent of the security lane (this review did not read `sdd/reviews/20261127-sol-pr455-security.md`)
- PR: #455 OPEN, `feat(media): attest PID 1 restart with unexpected Active units quarantines`
- URL: https://github.com/AgustinFalcon/storecore/pull/455
- branch: `feat/media-broker-4c-restart-unexpected-active-20261127`
- base branch: `master`
- head SHA: `58730de859f8418151e93fdbbcb2e66d047de36a`
- base SHA: `5fae6676f24fdaf7a15f186debe78f17679418dc`
- exact range: `5fae6676f24fdaf7a15f186debe78f17679418dc...58730de859f8418151e93fdbbcb2e66d047de36a`
- diff identity: 3 files, 97 insertions, 3 deletions; the full three-dot diff was read
- `git diff --check` on that range exited 0 with no output
- worktree HEAD is `58730de859f8418151e93fdbbcb2e66d047de36a`
- `git rev-parse origin/master` is `eb215a7b057a4dc68f1537177780b953f03efd93` (GitHub `master` tip, merge of PR #453, first parent `5fae6676f24fdaf7a15f186debe78f17679418dc`). `git merge-base origin/master HEAD` is `5fae6676f24fdaf7a15f186debe78f17679418dc`, so `git diff origin/master...HEAD` is the same three-file range. That later master commit does not touch `dbus.rs`, `STATUS.md`, `progress.md`, `meta.md`, or `plan.md`. Superseded SHA `8cd6fd4487c1e6b355491eb506f67beb029774d5` was not reviewed
- this review is not a GitHub approval, does not merge or retarget, and does not close or check off `003B-4C`, `003B-4B-3`, `003B-4B-4`, Ready, HTTP, or TASK-005

## PR intent and SDD why

`gh pr view 455` reports the expected OPEN implementation PR. The body attests a restart while an `Allocated` job still has PID 1 `.mount` and worker Active: reopening the journal stays `RecoveryPending` until reconcile, then terminate-verified unexpected inventory quarantines the job and keeps admission closed. Sockets, Ready, and HTTP stay out of the cut, and `003B-4C` stays open.

ADR-001 requires, before accepting jobs after a restart, an enumeration of the journal, mounts, and units by exact identity. What is still active is killed and reconciled, and cleanup happens only when no PID, cgroup, or mount remains. Any discrepancy retains evidence, marks `Quarantined`, and keeps the global gate closed until explicit intervention. `Allocated` does not expect runtime (`expects_runtime` is `Starting | Running | Terminating`). Active inventory on that job is a mismatch: terminate-verified, then `Quarantined`, with admission `Blocked(ReconciliationMismatch)`. Expected Active on `Running` remains the separate path that becomes `Terminal` and reopens admission.

`plan.md` on this head still records `MEDIA-NORMALIZE-003B-4C`, `003B-4B-3`, `003B-4B-4`, and TASK-005 as `[ ]`. The plan file is outside the diff. Meta is outside the diff and still names the unexpected-Active cut as in implementation, without sockets or `Ready`, and leaves `003B-4C` open.

## Hosted Verify and focused validations

Verify run `46071306234` is a completed `pull_request` run with conclusion `success` on exact head `58730de859f8418151e93fdbbcb2e66d047de36a`. All 7 jobs concluded `success`. None were cancelled:

- repository-hygiene `140748619460`
- productive-routes-real-e2e `140748677203`
- media-broker `140748677216`
- backend `140748677221`
- frontend `140748677230`
- unified-access-real-e2e `140748677239`
- media-broker-pid1 `140748677270`

The exact `media-broker-pid1` log records `pid1_allocated_job_with_active_units_is_quarantined_after_restart ... ok`. The test allocates JobId `[0x38; 16]`. The primary Rust result in that job records 43 passed and 0 failed.

`backend/media-broker/src/lib.rs` is absent from the range. On this head it still begins with `#![cfg(target_os = "linux")]` and `#![forbid(unsafe_code)]`.

Name-only diff is exactly:

- `backend/media-broker/src/dbus.rs`
- `sdd/STATUS.md`
- `sdd/wip/20261116-catalog-media-upload-and-variant-gallery/4-implementation/progress.md`

## Architecture review

- The new ignored PID 1 test allocates `[0x38; 16]`, leaves the durable job at `Allocated`, and starts the derived `.mount` and worker through the existing `start_pid1_self_test_worker` path. It drops the store and reopens the same journal. Reopen is `RecoveryPending`. A second allocate of `[0x39; 16]` returns `AdmissionClosed` before reconcile, so the broker does not accept a job while recovery is pending.
- `pid1_assert_unexpected_active_quarantined` reuses `Pid1ExpectedActive` with that job id. `enumerate` reports `RuntimeState::Active` only for the exact pair `(Mount Active, Worker Active)` and returns `Unavailable` for every other observation. `terminate` refuses a different job id and returns `Terminal` only after both `stop` results are `Inactive` or `Failed`. `reconcile_non_running` treats `Allocated` plus `Active` as inconsistent: it records the mismatch, calls `terminate_verified`, then quarantines. `finish_reconciliation` sees the mismatch and leaves admission `Blocked(ReconciliationMismatch)`.
- The helper asserts that contract on PID 1: both units are `Active` before reconcile; the report is `AdmissionBlocked` with `terminated == 1` and `mismatches == 1`; the job is `Quarantined`; admission is `Blocked(AdmissionBlock::ReconciliationMismatch)`; both units are `NotLoaded` after reconcile. That is terminate-verified quarantine, and it keeps the gate closed. It is the PID 1 form of `unexpected_runtime_is_terminated_quarantined_and_blocks_admission`. The sibling `pid1_assert_expected_active_terminated` still requires `Running` plus the same adapter to finish `Clean`, `Terminal`, and `AdmissionStatus::Open`.
- The range adds no unit properties. `ProtectHome`, `CPUQuota`, and `RestrictAddressFamilies` stay unset. The test uses `TransientUnits::derive` through the existing starter. Sockets, `Ready`, and HTTP are absent from the range.
- STATUS moves the next cut to socket family and `Ready`, and lists unexpected Active inventory with the already attested restart and expected-Active residuals. The same banner still says this document does not close `003B-4C`, still lacks socket family and `Ready`, and still leaves `003B-4B-3`, `003B-4B-4`, `003B-4`, TASK-005, and #7 open, with no media HTTP.
- Progress adds an `arranque` entry for unexpected Active inventory: `Allocated` with Active units reopens as `RecoveryPending`; `reconcile` terminates, quarantines, and keeps admission closed. It does not mark `003B-4C` and still names socket family, `Ready`, and media HTTP as missing.

## P0–P3

- P0: none
- P1: none
- P2: none
- P3: none

## Conclusion

The exact head attests PID 1 restart of an `Allocated` job whose `.mount` and worker are Active: recovery stays closed, `Pid1ExpectedActive` terminate-verifies the inventory, the job becomes `Quarantined`, and admission stays `Blocked(ReconciliationMismatch)`. Verify `46071306234` is 7/7 on `58730de859f8418151e93fdbbcb2e66d047de36a`, and the PID 1 log records the new test ok for JobId `[0x38; 16]`. `003B-4C`, `003B-4B-3`, `003B-4B-4`, Ready, HTTP, and TASK-005 stay open. `ProtectHome`, `CPUQuota`, and `RestrictAddressFamilies` stay unset. Architecture verdict: APPROVED with no P0–P3. This file is not a merge or a GitHub approval.
