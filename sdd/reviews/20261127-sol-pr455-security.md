VERDICT: APPROVED

## Evidence identity

- provider: xAI
- model: grok-4.7-medium-fast
- effort: medium
- lane: security
- authorized substitute after gpt-5.6-sol-medium quota
- independent of the architecture lane (this review did not read `sdd/reviews/20261127-sol-pr455-architecture.md`)
- PR: #455 OPEN, `feat(media): attest PID 1 restart with unexpected Active units quarantines`
- URL: https://github.com/AgustinFalcon/storecore/pull/455
- branch: `feat/media-broker-4c-restart-unexpected-active-20261127`
- base branch: `master`
- head SHA: `58730de859f8418151e93fdbbcb2e66d047de36a`
- base SHA: `5fae6676f24fdaf7a15f186debe78f17679418dc`
- exact range: `5fae6676f24fdaf7a15f186debe78f17679418dc...58730de859f8418151e93fdbbcb2e66d047de36a`
- diff identity: 3 files, 97 insertions, 3 deletions
- files: `backend/media-broker/src/dbus.rs`, `sdd/STATUS.md`, WIP `4-implementation/progress.md`
- superseded SHA `8cd6fd4487c1e6b355491eb506f67beb029774d5` was not reviewed
- `git diff --check` on that exact range: clean (exit 0)
- worktree `HEAD` is `58730de859f8418151e93fdbbcb2e66d047de36a`. No checkout, commit, push, or merge was performed
- local `git rev-parse origin/master` is `eb215a7b057a4dc68f1537177780b953f03efd93` (`Merge pull request #453`), which is ahead of the PR base. `5fae6676f24fdaf7a15f186debe78f17679418dc` is an ancestor of that tip and is `merge-base(origin/master, HEAD)`. `git diff origin/master...HEAD` and the exact range are the same blob (`4ca13c8246952e0be4878db0def2336cae91100c`): 3 files, 97 insertions, 3 deletions. GitHub reports the PR base as `5fae6676f24fdaf7a15f186debe78f17679418dc`, state `open`, `merged: false`
- Verify: `46071306234`, event `pull_request`, `completed` / `success`, headSha `58730de859f8418151e93fdbbcb2e66d047de36a`
- `backend/media-broker/src/lib.rs` still begins with `#![forbid(unsafe_code)]` and is outside the diff
- this file is not a GitHub approval and does not merge, retarget, or close `003B-4C`, `003B-4B-3`, `003B-4B-4`, Ready, HTTP, or TASK-005

## Hosted Verify

`gh run view 46071306234 --json conclusion,headSha,event,status` is `success` / `58730de859f8418151e93fdbbcb2e66d047de36a` / `pull_request` / `completed`.

All 7 jobs completed `success` on that head. None were cancelled or skipped:

- repository-hygiene `140748619460`
- productive-routes-real-e2e `140748677203`
- media-broker `140748677216`
- backend `140748677221`
- frontend `140748677230`
- unified-access-real-e2e `140748677239`
- media-broker-pid1 `140748677270`

`media-broker-pid1` records `test dbus::tests::pid1_allocated_job_with_active_units_is_quarantined_after_restart ... ok` at `2026-11-27T21:37:45.2200333Z`. The suite result is `ok. 43 passed; 0 failed; 0 ignored; 0 measured; 87 filtered out`. The log line does not print the job id; the test that passed allocates `[0x38; 16]` and uses `allocated.job_id()` for the units and the quarantine assertion. The same log still records `pid1_quarantined_job_stays_blocked_after_restart_with_absent_units ... ok` and `pid1_running_job_with_active_units_is_terminated_after_restart ... ok`.

## Why this cut

`gh pr view` / the pull object: PR #455 is OPEN. The body attests restart while an `Allocated` job still has the PID 1 `.mount` and worker Active: reopening the journal stays `RecoveryPending` until reconcile, then terminate-verified unexpected inventory quarantines the job and keeps admission closed. Sockets, Ready, and HTTP stay out. `003B-4C` stays open.

ADR-001 requires, before accepting jobs after a restart, an enumeration of the journal, mounts, and units by exact identity. What is still active is killed and reconciled, and cleanup happens only when no PID, cgroup, or mount remains. Any discrepancy retains evidence, marks `Quarantined`, and keeps the global gate closed until explicit intervention. Expected Active on a job that expects runtime (`Starting`, `Running`, or `Terminating`) is terminate-verified, then `Terminal`, and admission reopens only when that termination is verified and there is no mismatch. `Allocated` does not expect runtime. `Allocated` plus `Active` is a discrepancy: terminate the units, quarantine the job, and keep admission `Blocked(ReconciliationMismatch)`.

STATUS stays `En implementación` and says this document does not close `003B-4C`. The banner moves the next cut to socket family and `Ready`, lists unexpected Active inventory among the attested restart cases, and leaves `ProtectHome`, `RestrictAddressFamilies`, and `CPUQuota` out. It keeps `003B-4B-3`, `003B-4B-4`, `003B-4C`, `003B-4`, TASK-005, and #7 open, and adds no media HTTP. Progress adds `arranque 4C inventario Active inesperado`: after `Allocated` with both units Active, reopen is `RecoveryPending`; `reconcile` terminates the units, quarantines the job, and keeps admission closed. It does not mark `003B-4C`.

`plan.md` is outside the diff. `MEDIA-NORMALIZE-003B-4C` remains `[ ]`, as do `003B-4B-3`, `003B-4B-4`, and TASK-005. `meta.md` is outside the diff and still describes the unexpected-Active cut as in implementation, without sockets or `Ready`.

## Security review

- The new PID 1 test is `#[ignore]` outside the root/systemd job. It allocates `[0x38; 16]` and does not transition that record to `Starting`, `Running`, or `Terminating`. It starts the derived `.mount` and worker through the existing `start_pid1_self_test_worker` path, drops the store, and reopens the same journal. Reopen admission is `RecoveryPending`. `BrokerStore::allocate` returns `StoreError::AdmissionClosed` when admission is not `Open`, before `JobRecord::allocate`, budget admission, or journal persist. The attested call rejects `[0x39; 16]` while recovery is still pending.
- `JobState::expects_runtime` is only `Starting | Running | Terminating`. `Allocated` takes `reconcile_non_running`. The consistent pairs there are `Allocated` or `InputSealed` with `Absent`, and `Terminal` with `Absent` or `Terminal`. `Active` is inconsistent. That arm calls `record_mismatch` (`persist_intervention` of `ReconciliationMismatch`), then `terminate_verified` while the observation is `Active`, then `quarantine` unless the record is already `Quarantined`. It does not transition the job to `Terminal`.
- `finish_reconciliation(true)` runs because `report.mismatches != 0`. A mismatch, or any record already `Quarantined`, latches `ReconciliationMismatch`. The resulting admission is `Blocked` whenever `durable_block` is set. `AdmissionStatus::Open` is reached only when there is no durable block and the budget still verifies. The PID 1 assertion is `ReconcileStatus::AdmissionBlocked`, `terminated == 1`, `mismatches == 1`, admission `Blocked(AdmissionBlock::ReconciliationMismatch)`, and the job `Quarantined`.
- The helper reuses `Pid1ExpectedActive` and does not widen it. `enumerate` returns one `RuntimeState::Active` observation only for the exact pair `(Mount Active, Worker Active)` on this job's derived spec. Every other pair returns `AdapterError::Unavailable`, which `reconcile` maps to a closed `ReconciliationUnavailable` error rather than a clean report. `terminate` returns `Unavailable` for any other job id. It stops the worker and then the mount, and returns `RuntimeState::Terminal` only when both results are `Inactive` or `Failed`. `terminate_verified` accepts only that `Terminal` value; any other stop result is `TerminationUnverified` and closes admission as `ReconciliationUnavailable`. After the successful reconcile, both units attest `SystemdError::NotLoaded`.
- The sibling helper `pid1_assert_expected_active_terminated` is unchanged and still expects `ReconcileStatus::Clean`, `AdmissionStatus::Open`, and `JobState::Terminal`. The new test does not call it. That reopen path stays on `expects_runtime`. This cut's `Allocated` record cannot enter it.
- The diff adds no `ProtectHome`, `CPUQuota`, or `RestrictAddressFamilies` key. It does not change `TransientUnits::derive`, `start_transient`, or the property tables that already assert those keys are absent. It adds no HTTP route, secret, tag, deploy, or publish step. `lib.rs` is untouched and still `#![forbid(unsafe_code)]`.

## Residuals

These stay open. They are not new defects in this range:

- `MEDIA-NORMALIZE-003B-4C` remains `[ ]`. Socket family, `Ready`, and media HTTP are still unattested. `003B-4B-3`, `003B-4B-4`, `003B-4`, TASK-005, and MEDIA-NORMALIZE-004 stay open.
- `ProtectHome`, `RestrictAddressFamilies`, and `CPUQuota` stay unset.
- `Pid1ExpectedActive` attests this job's derived pair. A pair other than both `Active` fails closed. Enumeration of unrelated units on the system bus remains inside the open `003B-4C` harness.
- This new test does not reopen the journal after the quarantine it just wrote. Admission after reconcile is already `Blocked(ReconciliationMismatch)`, and `allocate` rejects every non-`Open` status. The same PID 1 run still passes the existing Quarantined-plus-absent restart test.

No P0–P3.

## Verdict

APPROVED for exact head `58730de859f8418151e93fdbbcb2e66d047de36a` over base `5fae6676f24fdaf7a15f186debe78f17679418dc`. Verify `46071306234` is success, completed, `pull_request`, on that head, with all 7 jobs success. Unexpected Active on an `Allocated` job terminates both units, quarantines the job, and leaves admission `Blocked(ReconciliationMismatch)`. It does not reuse the expected-Active reopen. This file stays untracked, is not a GitHub approval, and does not merge, retarget, or close `003B-4C`, `003B-4B-3`, `003B-4B-4`, Ready, HTTP, or TASK-005.
