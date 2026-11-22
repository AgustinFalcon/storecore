VERDICT: APPROVED

## Evidence identity

- provider: xAI
- model: Grok 4.7
- effort: medium
- substitute-for: gpt-5.6-sol-medium (no quota)
- lane: architecture
- independent of the security lane
- PR: 358 OPEN `feat(media): attest PID 1 RuntimeMax timeout on blocked request` https://github.com/AgustinFalcon/storecore/pull/358
- branch: `feat/media-broker-4c-timeout-20261122`
- head SHA: `cda8f48d34482af7becb25910520186d90091411`
- `git rev-parse HEAD`: `cda8f48d34482af7becb25910520186d90091411` (matches GitHub `headRefOid`)
- base SHA / `origin/master`: `8a2ca296f2198f5a918738385e01248c04ff71ba` (`git rev-parse origin/master`; GitHub `baseRefOid` matches). That commit is `Merge pull request #357`. First parent is `d24742bbb3cee3807c5c87031e20c0fae4dcadd0` (persist of PR #356).
- Verify on this head: run `45000735868` (`pull_request`, name `Verify`, status `completed`, conclusion `success`, `headSha` `cda8f48d34482af7becb25910520186d90091411`). 7/7 success. None cancelled. One Verify run on this SHA. Billing was not an exception on this run.
- local cargo: not run. This host is Windows. The new PID 1 test is `#[ignore]` and runs in `media-broker-pid1`. Focused validation is that hosted Verify run. Its log records `dbus::tests::pid1_worker_runtime_max_stops_frozen_mainpid ... ok` and `test result: ok. 8 passed; 0 failed; 0 ignored; 0 measured; 61 filtered out`.
- this file is not a GitHub approval and does not mark `003B-4C` closed

## Job conclusions (Verify 45000735868)

Seven jobs, all `completed` / `success` on `cda8f48d34482af7becb25910520186d90091411`. None cancelled:

- repository-hygiene: success (`137141490282`)
- backend: success (`137141536489`)
- media-broker: success (`137141536512`)
- media-broker-pid1: success (`137141536525`)
- frontend: success (`137141536528`)
- productive-routes-real-e2e: success (`137141536475`)
- unified-access-real-e2e: success (`137141536485`)

`media-broker-pid1` `137141536525` is the job that executed `pid1_worker_runtime_max_stops_frozen_mainpid`. The dbus binary finished `8 passed; 0 failed`.

## Diff reviewed

`git diff origin/master...HEAD`: 3 files, +185 / −7. Seven commits on `8a2ca296f2198f5a918738385e01248c04ff71ba`:

- `80b2fcf0090a8538877a2c78e38e8482077a1380` `feat(media): attest PID 1 RuntimeMax timeout on blocked request`
- `64181cd7121fd89b383dd83fbc81fef4cd7783bb` `fix(media): accept systemd 12s RuntimeMaxUSec display`
- `da57a556a213a742b51efa3898d2cf9243a9b175` `fix(media): attest RuntimeMax on RemainAfterExit unit`
- `60e9d9a47bddd4054467f069649f3a335909b4bb` `fix(media): freeze worker MainPID so RuntimeMax can fire`
- `8b75f6363d6710122689c84e3e766be137aa5002` `fix(media): rustfmt worker timeout imports`
- `c7c2a7bf64d6855fda30bc0e497672225638eb34` `fix(media): clippy RuntimeMax docs and split timeout property test`
- `cda8f48d34482af7becb25910520186d90091411` `docs: record master 8a2ca29 PR 357 under open 4C timeout cut`

| File | change |
| --- | --- |
| `backend/media-broker/src/dbus.rs` | `worker_properties` gains internal `RuntimeMaxUSec` and `TimeoutStopUSec`. Unit test locks those constants. Ignored PID 1 test SIGSTOPs `MainPID` and waits for the runtime-limit journal |
| `sdd/STATUS.md` | implementation banner names the 12s / 1s derivation and the frozen `MainPID` attest, and leaves `003B-4C` open; master paragraphs record `8a2ca29` / PR #357 and `d24742b` / PR #356 |
| `sdd/wip/.../4-implementation/progress.md` | same claim; `003B-4C` is not marked |

`plan.md`, `spec.md`, and `meta.md` are not in the diff. No Kotlin, Angular, workflow, migration, fixture, lockfile, HTTP route, or secret.

## Why this cut

`003B-4C` in `plan.md` on this SHA is still `[ ]` (line 89): harness Linux real con UID A/UID B, SELF_TEST/NORMALIZE dentro de la unidad, attestación efectiva de cgroup v2/mount/quota, aislamiento entre jobs, fallos y reinicios. The spec paragraph still requires SELF_TEST/NORMALIZE, isolation, per-job and global quota, terminals without ACK, FD/mmap after seal, OOM/timeout, cgroup termination, substitution rejection, and restart on every durable transition before that gate can close. ADR-001 still names `RuntimeMaxSec` and `TimeoutStopSec` on each unit, still sets the `IMAGE_IO_V1` ceiling at 12 s, and still says only `4A+4B+4C` can complete `003B-4`. `003B-4B-3`, `003B-4B-4`, `MEDIA-NORMALIZE-003B-4`, `MEDIA-NORMALIZE-004`, and `TASK-005` stay `[ ]`. `meta.md` estado remains `implementation_in_progress` and its gate paragraph still ends on PR #355.

STATUS says this cut does not close `003B-4C`. It derives `RuntimeMaxUSec=12s` and `TimeoutStopUSec=1s`, freezes `MainPID`, and attests that PID 1 cuts the worker when the ceiling expires. It records that a FIFO and `RemainAfterExit` with no live process do not fire the timeout. It still lacks OOM, cgroup termination, `CPUQuota`, and `Ready`. No HTTP.

The PR body matches the tree: both limits are derived for `IMAGE_IO_V1`, the harness freezes `MainPID` and attests the PID 1 timeout, FIFO and `RemainAfterExit` without a process do not fire it, and `003B-4C` stays open. The PR test plan leaves Verify, the pid1 test, and the `003B-4C` checkbox unchecked. This review does not check them off.

## Implementation

`WORKER_RUNTIME_MAX_USEC` is `12_000_000` and `WORKER_TIMEOUT_STOP_USEC` is `1_000_000`. Both are crate constants. `worker_properties` is the only worker property bag, and `start_transient` sends it through `properties(UnitKind::Worker)`. The client does not supply either value. The unit stays `Type=exec` with `RemainAfterExit=true`. `derived_worker_timeout_matches_image_io_v1` asserts both keys and that the `Value` debug form contains those constants.

`pid1_worker_runtime_max_stops_frozen_mainpid` is ignored unless `/proc/1/comm` is `systemd` and euid is 0. It derives job `[0x99; 16]` and principal `2102:2102`, starts the mount, writes the existing `SELF_TEST` `request.bin`, and starts the worker through PID 1. `freeze_worker_main_pid` reads `MainPID` and sends `kill -STOP`. `systemctl --value` may print the microsecond integer or `12s`; both match the derived 12 s ceiling. `wait_runtime_timeout_journal` waits up to 20 s for `Reached runtime time limit` (or the systemd timeout result line). `result.bin` must still be absent. Stop of the worker and the mount accepts `Inactive` or `Failed`.

That shape matches the failed alternatives recorded in the commits. `MediaWorkerJobFiles.readBounded` requires a regular file, so a FIFO `request.bin` makes the worker exit `UNKNOWN_EXIT` before a 12 s ceiling can elapse. `RemainAfterExit` keeps the unit `Active` after `SELF_TEST` has already exited, and `RuntimeMax` does not fire with no live main process. `SIGSTOP` keeps that `MainPID` alive so PID 1's wall clock can reach the derived ceiling. The hosted job reached `ok` about 42 s after the previous pid1 test, which is consistent with the 12 s ceiling plus the 1 s stop grace and harness setup.

`UnitKind` / `UnitState` stay the closed unit types. The timeout is a derived property and a journal attest, not a new string state in a view. No client property is added.

## Ledger

- `sdd/STATUS.md` banner is `4C timeout del worker`. It says this cut does not close `003B-4C`. It names `RuntimeMaxUSec=12s`, `TimeoutStopUSec=1s`, a frozen `MainPID`, and the PID 1 cut. FIFO and `RemainAfterExit` without a process do not fire the timeout. OOM, cgroup termination, `CPUQuota`, and `Ready` stay absent. `003B-4B-3`, `003B-4B-4`, `003B-4C`, `003B-4`, TASK-005, and #7 stay open. No HTTP.
- The new master paragraphs describe merged `8a2ca296f2198f5a918738385e01248c04ff71ba` / PR #357 and `d24742bbb3cee3807c5c87031e20c0fae4dcadd0` / PR #356. On that merged tree, timeout is still unmarked. The implementation banner describes this unmerged candidate.
- `progress.md` records the same derivation, the same `Reached runtime time limit` attest, and that `003B-4C` is not marked. No OOM, cgroup termination, `Ready`, or HTTP.
- `plan.md` is not in the diff. `MEDIA-NORMALIZE-003B-4C` remains `- [ ]`.

## Standards applied

`sdd/reviews/20261122-sol-pr355-architecture.md`: a PID 1 attest of one boundary stays inside the harness and leaves `003B-4C`, `Ready`, and HTTP open. `sdd/reviews/20261121-sol-pr331-architecture.md`: unit properties stay internally derived. The checkbox rule recorded from `sdd/reviews/20261121-sol-pr334-architecture.md` in those later reviews still applies: the canonical plan checkbox stays `[ ]` until the gate is actually done. Closed unit kinds stay `UnitKind` / `UnitState`. Android architecture standards and the Spring/Kotlin backend standards do not apply to the behavior under review: the diff has no ViewModel, UiState, controller, or Kotlin change. The existing worker regular-file rule is unchanged and explains why a FIFO cannot attest this ceiling.

## Findings

No P0. No P1. No P2. No P3.

## Residuals (not findings)

- `003B-4B-3`, `003B-4B-4`, aggregate `003B-4B`, `003B-4C`, `003B-4`, `MEDIA-NORMALIZE-004`, TASK-005, and #7 stay open. No `Ready`, no catalog HTTP, no secrets, no deploy. This review does not check off `003B-4C`.
- OOM and cgroup kill stay out. `CPUQuota` stays unset. This diff does not add them.
- The harness attests PID 1's wall-clock ceiling on a stopped `MainPID`. It does not attest a native decoder that ignores cancellation, `KillMode=control-group`, or `memory.oom.group`.
- `TimeoutStopUSec=1s` is derived and locked in the property test. The PID 1 test reads back `RuntimeMaxUSec`, not the stop grace. The 1 s grace remains part of the open effective-attestation residual.
- `meta.md` on this SHA still ends at PR #355. It does not name head `cda8f48d`. The implementation banner and progress carry this cut. That matches the earlier feature cuts, which updated `meta.md` when the reviews were persisted.
- This review file is not a GitHub approval, a merge, or a `Ready` declaration, and it does not mark `003B-4C` closed.

## Conclusion

Head `cda8f48d34482af7becb25910520186d90091411` derives `RuntimeMaxUSec=12s` and `TimeoutStopUSec=1s` inside `worker_properties` and attests, on PID 1, that `SIGSTOP` of `MainPID` ends in the journal line `Reached runtime time limit` with no `result.bin`. A FIFO is not a regular file, and `RemainAfterExit` after `SELF_TEST` does not fire `RuntimeMax`. Verify `45000735868` is success 7/7 on this SHA, none cancelled, and `media-broker-pid1` `137141536525` passed `pid1_worker_runtime_max_stops_frozen_mainpid` (`8 passed; 0 failed`). `003B-4C`, `Ready`, and HTTP stay open. No P0–P3. `APPROVED` for the architecture lane. This file is not a GitHub approval and does not mark `003B-4C` closed.
