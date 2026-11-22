VERDICT: APPROVED

## Evidence identity

- provider: xAI
- model: Grok 4.7
- effort: medium
- substitute-for: gpt-5.6-sol-medium
- lane: architecture
- PR: 355 OPEN `feat(media): reject substituted approved jar before PID 1 start` https://github.com/AgustinFalcon/storecore/pull/355
- branch: `feat/media-broker-4c-substitution-20261122`
- head SHA: `73192046a927a34a7008f824d40c3c9e260a74a3`
- `git rev-parse HEAD`: `73192046a927a34a7008f824d40c3c9e260a74a3` (matches GitHub `headRefOid`)
- base SHA / `origin/master`: `17c6544e36ce03a00186dd2cb4bc07606aa74a2d` (`git rev-parse origin/master`; GitHub `baseRefOid` matches). That commit is the merge of PR #354, `docs: persist PR 353 dual Grok reviews without closing 4C`.
- Verify on this head: run `44994529755` (`pull_request`, name `Verify`, status `completed`, conclusion `success`, `headSha` `73192046a927a34a7008f824d40c3c9e260a74a3`, display title matches this PR). 7/7 success. None cancelled. One Verify run on this SHA. Billing was not an exception on this run.
- local cargo: not run. This host is Windows. The new PID 1 test is `#[ignore]` and runs in `media-broker-pid1`. Focused validation is that hosted Verify run. Its log records `dbus::tests::pid1_rejects_substituted_runtime_jar ... ok` and `test result: ok. 7 passed; 0 failed`.
- this file is not a GitHub approval and does not mark `003B-4C` closed

## Job conclusions (Verify 44994529755)

Seven jobs, all `completed` / `success` on `73192046a927a34a7008f824d40c3c9e260a74a3`. None cancelled:

- repository-hygiene: success (`137122585208`)
- media-broker-pid1: success (`137122636284`)
- media-broker: success (`137122636292`)
- frontend: success (`137122636346`)
- unified-access-real-e2e: success (`137122636356`)
- backend: success (`137122636359`)
- productive-routes-real-e2e: success (`137122636383`)

`media-broker-pid1` `137122636284` is the job that executed `pid1_rejects_substituted_runtime_jar`. The dbus binary finished `7 passed; 0 failed`.

## Diff reviewed

`git diff origin/master...HEAD`: 3 files, +102 / −10. One commit on `17c6544e36ce03a00186dd2cb4bc07606aa74a2d`:

- `73192046a927a34a7008f824d40c3c9e260a74a3` `feat(media): reject substituted approved jar before PID 1 start`

| File | change |
| --- | --- |
| `backend/media-broker/src/dbus.rs` | tests only (+79 / −2). Import `RuntimeError` and `PermissionsExt`. New ignored test and `copied_pid1_runtime`. No change to `mount_properties`, `worker_properties`, `start_transient`, or the daemon |
| `sdd/STATUS.md` | implementation banner names the jar digest attest and leaves `003B-4C` open; master paragraph records merged `17c6544` / PR #354 |
| `sdd/wip/.../4-implementation/progress.md` | same claim; the prior #353 entry now names the #354 persist merge |

`plan.md` and `meta.md` are not in the diff. No Kotlin, Angular, workflow, migration, fixture, lockfile, HTTP route, or secret. The diff does not add leftover reviews for #329, #334, #339, #341, #343, #347, #349, #352, or #354.

## Why this cut

`003B-4C` in `plan.md` on this SHA is still `[ ]` (line 89): harness Linux real con UID A/UID B, SELF_TEST/NORMALIZE dentro de la unidad, attestación efectiva de cgroup v2/mount/quota, aislamiento entre jobs, fallos y reinicios. The spec paragraph still requires OOM/timeout, cgroup termination, substitution rejection, and restart on every durable transition before that gate can close, and it still says mocks or a direct jar run do not close it. ADR-001 still requires the harness to show distinct principals, effective limits, termination, cleanup, and recovery, and it still says only `4A+4B+4C` can complete `003B-4`. `003B-4B-3`, `003B-4B-4`, `MEDIA-NORMALIZE-003B-4`, `MEDIA-NORMALIZE-004`, and `TASK-005` stay `[ ]`. `meta.md` estado remains `implementation_in_progress` and its gate paragraph still ends on PR #353.

This cut attests one PID 1 fact: a copy of the approved jar, after an in-place overwrite, makes `ApprovedRuntime::confirm()` return `RuntimeError::DigestMismatch`, and the harness does not start the worker. STATUS and progress say the cut leaves `003B-4C`, `Ready`, and HTTP open. That scope matches the diff.

The PR body matches the tree: the harness copies the approved runtime, alters the jar, attests `DigestMismatch`, does not start the substituted worker, and does not close `003B-4C`.

## Implementation

`pid1_rejects_substituted_runtime_jar` is an ignored PID 1 test. It requires `/proc/1/comm` = `systemd` and euid 0, then connects to the system bus. `copied_pid1_runtime` copies `STORECORE_MEDIA_JAVA` and `STORECORE_MEDIA_JAR` into a fresh temp directory, sets `0555` / `0444`, `chown`s both to root, hashes those copied bytes, and `ApprovedRuntime::open`s them with owner `0`. The first `confirm()` must succeed on that unmodified copy. The installed jar used by the other `pid1_` tests is left unchanged.

The harness derives one `JobId` (`[0x88; 16]`) and principal `2102:2102` through `TransientUnits::derive`. It starts only `UnitKind::Mount` and requires `UnitState::Active`. It writes the existing `SELF_TEST` request on that `Where`, then `fs::write`s `substituted-storecore-jar\n` over the copied jar path. The assertion is `runtime.confirm() == Err(RuntimeError::DigestMismatch)`. `result.bin` must be absent. The harness then stops the mount and accepts `Inactive` or `Failed`.

That error is the closed `RuntimeError` variant. `confirm()` reopens both paths with `NOFOLLOW` and `approve()` hashes the leaf before it compares inode identity. An in-place byte change at the approved path returns `DigestMismatch` when mode, owner, and link count still match. The hosted job reached that assertion, so the overwritten copy was still a root-owned regular `0444` file with a different digest. `UnitState` stays the closed mount result. No view compares a new status string. No client property is added.

`BrokerDaemon::start` already calls `self.runtime.confirm()` and maps `RuntimeError` to `DaemonError::Runtime` before `TransientUnits::derive` and before either `start_kind` (`StartTransientUnit` for the mount, then the worker). `start_rejects_replaced_runtime_before_starting` already locks that order on `FakeSystemd`: a replaced runtime returns `DigestMismatch`, the job stays `InputSealed`, and neither unit is recorded `Active`. This PID 1 test does not call `BrokerDaemon::start`. It attests the real `confirm()` digest on a copied jar while a PID 1 mount is up, and it does not send `StartTransientUnit` for the worker. The assertion label says the daemon start must refuse the jar; the call under test is `confirm()`, and the production start path is the existing call above.

## Ledger

- `sdd/STATUS.md` banner is `4C rechazo de sustitución`. It says this cut does not close `003B-4C`. It names a copied approved runtime, an altered jar, `RuntimeError::DigestMismatch` from `confirm()`, and no worker start. It still lacks `CPUQuota` and `Ready`. `003B-4B-3`, `003B-4B-4`, `003B-4C`, `003B-4`, TASK-005, and #7 stay open. No HTTP.
- The new master paragraph describes merged `17c6544e36ce03a00186dd2cb4bc07606aa74a2d` / PR #354 and leaves substitution rejection on that merged tree unmarked. The implementation banner describes this unmerged candidate.
- `progress.md` records the same copy, the same `DigestMismatch`, and that `003B-4C` is not marked. No `Ready` or HTTP. The previous entry now attributes the persist merge to PR #354 while keeping the #353 head, Verify `44992591084`, and the two Grok 4.7 reviews.
- `plan.md` is not in the diff. `MEDIA-NORMALIZE-003B-4C` remains `- [ ]`.

## Standards applied

`sdd/reviews/20261122-sol-pr353-architecture.md`: a PID 1 attest of one boundary stays inside the harness and leaves `003B-4C`, `Ready`, and HTTP open. `sdd/reviews/20261122-sol-pr350-architecture.md`: the same rule, and substitution rejection was still outside that cut. `sdd/reviews/20261121-sol-pr331-architecture.md`: unit properties stay internally derived; this diff does not add a client-supplied property. The checkbox rule recorded from `sdd/reviews/20261121-sol-pr334-architecture.md` in those later reviews still applies: the canonical plan checkbox stays `[ ]` until the gate is actually done. That #334 file is not present under `sdd/reviews/` in this worktree; it is not part of this diff. Closed unit kinds stay `UnitKind` / `UnitState`. `RuntimeError::DigestMismatch` is the closed runtime error, not a new string state. Android architecture standards and the Spring/Kotlin backend standards do not apply: the diff has no ViewModel, UiState, controller, or Kotlin file.

## Findings

No P0. No P1. No P2. No P3.

## Residuals (not findings)

- `003B-4B-3`, `003B-4B-4`, aggregate `003B-4B`, `003B-4C`, `003B-4`, `MEDIA-NORMALIZE-004`, TASK-005, and #7 stay open. No `Ready`, no catalog HTTP, no secrets, no deploy. This review does not check off `003B-4C`.
- OOM, timeout, and cgroup kill stay out. `CPUQuota` stays unset. This diff does not add it.
- The harness does not start the worker and does not call `BrokerDaemon::start`. Absence of `result.bin` shows this test issued no worker `StartTransientUnit`. The production refusal remains the existing `confirm()` before `StartTransientUnit`.
- Substituted `output.bin` / `result.bin`, a UID B write against the installed runtime, and a PID 1 overwrite of the Java binary stay out. The daemon fake test still covers a replaced Java file before start. Same-digest inode replacement stays `IdentityDrift` in `confirm_rejects_replaced_file_at_the_same_path` and is not this PID 1 attest.
- `meta.md` on this SHA still ends at PR #353. It does not name head `73192046`. The implementation banner and progress carry this cut. That matches the earlier feature cuts, which updated `meta.md` when the reviews were persisted.
- This review file is not a GitHub approval, a merge, or a `Ready` declaration, and it does not mark `003B-4C` closed.

## Conclusion

Head `73192046a927a34a7008f824d40c3c9e260a74a3` attests a PID 1 harness that copies the approved Java/jar, confirms the copy, starts only the derived mount, overwrites the copied jar, and receives `RuntimeError::DigestMismatch` from `confirm()` with no `result.bin`. Verify `44994529755` is success 7/7 on this SHA, none cancelled, and `media-broker-pid1` `137122636284` passed `pid1_rejects_substituted_runtime_jar` (`7 passed; 0 failed`). `003B-4C`, `Ready`, and HTTP stay open. No P0–P3. `APPROVED` for the architecture lane. This file is not a GitHub approval and does not mark `003B-4C` closed.
