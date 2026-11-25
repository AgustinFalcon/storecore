VERDICT: APPROVED

## Evidence identity

- provider: xAI
- model: Grok 4.7
- effort: medium
- substitute-for: gpt-5.6-sol-medium (no quota)
- lane: architecture
- independent of the security lane
- PR: 366 OPEN `feat(media): attest PID 1 KillMode stop kills cgroup members` https://github.com/AgustinFalcon/storecore/pull/366
- branch: `feat/media-broker-4c-cgroup-kill-20261124`
- head SHA: `0a02b5834a9b1a8ae325caf041746dab18d499db`
- `git rev-parse HEAD`: `0a02b5834a9b1a8ae325caf041746dab18d499db` (matches GitHub `headRefOid`)
- GitHub `baseRefOid` / merge-base: `7c2a819470ea614d4750b96afd88150a09aab5b7` (`docs: persist PR 360 dual Grok reviews without closing 4C (#365)`). `git merge-base origin/master HEAD` is that commit.
- `origin/master` at review time: `ac92b03e3dcbfc89de804ce2f50bf30d46e0e316` (`Merge pull request #372 from AgustinFalcon/feat/phase1-commercial-calendar-http`). That tip is ahead of the merge-base. Three-dot `git diff origin/master...HEAD` is still the three files below because the merge-base is `7c2a819`.
- diff identity: 3 files, +237 / −6 (`backend/media-broker/src/dbus.rs`, `sdd/STATUS.md`, `sdd/wip/20261116-catalog-media-upload-and-variant-gallery/4-implementation/progress.md`)
- Verify on this head: run `45534853760` (`pull_request`, name `Verify`, status `completed`, conclusion `success`, `headSha` `0a02b5834a9b1a8ae325caf041746dab18d499db`). 7/7 success. None cancelled. One Verify run on this SHA. Billing was not an exception on this run.
- local cargo: not run. This host is Windows. The new PID 1 test is `#[ignore]` and runs in `media-broker-pid1`. Focused validation is that hosted Verify run. Its log records `dbus::tests::pid1_stop_kills_extra_cgroup_process ... ok` and `test result: ok. 10 passed; 0 failed; 0 ignored; 0 measured; 62 filtered out`.
- this file is not a GitHub approval and does not mark `003B-4C` closed

## Job conclusions (Verify 45534853760)

Seven jobs, all `completed` / `success` on `0a02b5834a9b1a8ae325caf041746dab18d499db`. None cancelled:

- repository-hygiene: success (`138938834998`)
- backend: success (`138938915832`)
- frontend: success (`138938915842`)
- media-broker-pid1: success (`138938915896`)
- media-broker: success (`138938915914`)
- unified-access-real-e2e: success (`138938915957`)
- productive-routes-real-e2e: success (`138938915978`)

`media-broker-pid1` `138938915896` is the job that executed `pid1_stop_kills_extra_cgroup_process`. The dbus binary finished `10 passed; 0 failed`.

## Diff reviewed

`git diff origin/master...HEAD`: 3 files, +237 / −6. Six commits on `7c2a819470ea614d4750b96afd88150a09aab5b7`:

- `51a93f841507f3459386ed5d69447265e17896d0` `feat(media): attest PID 1 KillMode stop kills cgroup members`
- `1941dd16575d236f944e62fb03f0d93746d33bae` `fix(media): freeze MainPID so KillMode stop has a live cgroup`
- `70c2fe56be216a16130bf3e15ad120dee5c42131` `docs(sdd): record #366 rebase onto master 4b0e06a`
- `f30c089606e1780b7b876a1a7e53363b7bfef12a` `fix(media): attach frozen extra PID before KillMode stop`
- `bd775b8f2d89a7f58c6c004aab4c632ffb420223` `fix(media): derive KillSignal SIGKILL so StopUnit reaps extras`
- `0a02b5834a9b1a8ae325caf041746dab18d499db` `fix(media): reap KillMode extra by waitpid not /proc`

| File | change |
| --- | --- |
| `backend/media-broker/src/dbus.rs` | `worker_properties` gains internal `KillSignal` `9i32` (SIGKILL) next to existing `KillMode=control-group`. `MemoryOOMGroup` and `OOMPolicy` stay absent. Unit test locks both keys. Ignored PID 1 test freezes `MainPID`, `SIGSTOP`s a `sleep`, `AttachProcessesToUnit`, `SIGCONT`, `StopUnit`, and reaps with `waitpid` |
| `sdd/STATUS.md` | implementation banner names the frozen `MainPID`, the attached `sleep`, derived `KillSignal=SIGKILL`, and the `StopUnit` attest, and leaves `003B-4C` open; master paragraphs record `7c2a819` / PR #365, `4b0e06a` / PR #371, and `227412d` / PR #370 |
| `sdd/wip/.../4-implementation/progress.md` | same claim, including `AttachProcessesToUnit` and `waitpid`; `003B-4C` is not marked |

`plan.md`, `spec.md`, `meta.md`, and ADR-001 are not in the diff. No Kotlin, Angular, workflow, migration, fixture, lockfile, HTTP route, or secret. `CPUQuota` does not appear under `backend/media-broker`.

## Why this cut

`003B-4C` in `plan.md` on this SHA is still `[ ]` (line 89): harness Linux real con UID A/UID B, SELF_TEST/NORMALIZE dentro de la unidad, attestación efectiva de cgroup v2/mount/quota, aislamiento entre jobs, fallos y reinicios. The spec paragraph still requires SELF_TEST/NORMALIZE, isolation, per-job and global quota, terminals without ACK, FD/mmap after seal, OOM/timeout, cgroup termination, substitution rejection, and restart on every durable transition before that gate can close. ADR-001 still requires `KillMode=control-group`, `memory.oom.group`, `CPUQuota`, namespaces, socket family, and RLIMIT before `Ready`, and still says only `4A+4B+4C` can complete `003B-4`. `003B-4B-3`, `003B-4B-4`, `MEDIA-NORMALIZE-003B-4`, `MEDIA-NORMALIZE-004`, and `TASK-005` stay `[ ]`.

STATUS says this cut does not close `003B-4C`. It freezes `MainPID` so the cgroup survives `RemainAfterExit` after `SELF_TEST`, attaches a `sleep`, derives `KillSignal=SIGKILL`, and attests that `StopUnit` with `KillMode=control-group` kills that member. `CPUQuota` and `Ready` stay absent. No HTTP.

The PR body matches the tree: the PID 1 harness starts the derived worker, attests `KillMode=control-group`, injects a `sleep` into the worker cgroup, and requires `StopUnit` to reap it. The client still cannot supply exec, `Where`, or limits. `CPUQuota`, `MemoryOOMGroup`, and `OOMPolicy` stay unset on `StartTransientUnit`. The body says this cut does not close `003B-4C`, Ready, or HTTP. The PR test plan leaves Verify, the dual reviews, and the `003B-4C` checkbox unchecked. This review does not check them off.

## Implementation

`TransientUnits::derive` still takes only `JobId`, the jobs root, `Principal`, and `&ApprovedRuntime`. Its contract still says callers cannot supply unit names, `Where`, or `ExecStart`. `worker_properties` is the only worker property bag, and `properties(UnitKind::Worker)` is what `start` sends to `StartTransientUnit`. The new key is `KillSignal` with the internal literal `9i32`. `KillMode` stays the internal literal `control-group`. The vector has no `CPUQuota`, `MemoryOOMGroup`, or `OOMPolicy`. `derived_worker_oom_kills_the_cgroup` asserts both kill keys, that `KillMode` contains `control-group`, that the signal debug form contains `9`, and that `MemoryOOMGroup` and `OOMPolicy` are absent. `UnitKind` / `UnitState` stay the closed unit types.

`pid1_stop_kills_extra_cgroup_process` is ignored unless `/proc/1/comm` is `systemd` and euid is 0. It derives job `[0xbb; 16]` and principal `2102:2102`, starts the mount, writes the existing `SELF_TEST` `request.bin`, and starts the worker through PID 1. `freeze_worker_main_pid` runs before the extra is spawned, because `RemainAfterExit` after `SELF_TEST` empties `ControlGroup`. `systemctl` must show `KillMode=control-group` and `KillSignal` of `9` or `SIGKILL`. `spawn_cgroup_sleeper` starts `sleep 60`, sends `SIGSTOP`, waits until `/proc` shows stopped, then `AttachProcessesToUnit` (`ssau`, subcgroup `""`, one pid). If that bus call fails, the harness writes the same pid to the unit `cgroup.procs` it just read from `ControlGroup`. It then checks `/proc/<pid>/cgroup` contains that cgroup, sends `SIGCONT`, and calls `StopUnit`. Stop of the worker and the mount accepts `Inactive` or `Failed`. `wait_child_reaped` uses `try_wait` / `wait`. A `State: Z` line is a successful kill: `SIGKILL` leaves a zombie, and `/proc` exists until the harness parent reaps it. The test does not treat a live `/proc` entry as failure once the child is a zombie.

That shape matches the failed alternatives recorded in the commits. `RemainAfterExit` after `SELF_TEST` clears `ControlGroup`, so the extra has no unit cgroup unless `MainPID` is frozen first. A live `sleep` written only to `cgroup.procs` can leave systemd's unit, so the harness stops it and attaches it. A `SIGSTOP` extra survived `StopUnit` in a deleted cgroup under the default kill signal; `KillSignal=SIGKILL` is the first kill signal, then the extra is continued and stopped. `SIGKILL` leaves a zombie, so the attest is `waitpid`, not disappearance of `/proc`. The hosted job reached `ok` (`10 passed; 0 failed`).

## Ledger

- `sdd/STATUS.md` banner is `4C terminación del cgroup`. It says this cut does not close `003B-4C`. It names a frozen `MainPID`, an attached `sleep`, derived `KillSignal=SIGKILL`, and `StopUnit` with `KillMode=control-group`. `CPUQuota` and `Ready` stay absent. `003B-4B-3`, `003B-4B-4`, `003B-4C`, `003B-4`, TASK-005, and #7 stay open. No HTTP.
- The new master paragraphs describe merged `7c2a819470ea614d4750b96afd88150a09aab5b7` / PR #365, `4b0e06ab3d6f73ed7d038aa587a9687bef2e10d8` / PR #371, and `227412d6426cd488a91dd321c166ef8ea20c95be` / PR #370. On that merged tree, cgroup termination is still unmarked. The implementation banner describes this unmerged candidate. Live `origin/master` `ac92b03` (PR #372) is not named in those paragraphs; it landed after the merge-base and is outside this three-dot diff.
- `progress.md` records the same derivation, `AttachProcessesToUnit`, `waitpid` because `SIGKILL` leaves a zombie, and that `003B-4C` is not marked. `CPUQuota` stays out. No `Ready` or HTTP. It also records the rebase onto `4b0e06a` / PR #371 without marking the gate.
- `plan.md` is not in the diff. `MEDIA-NORMALIZE-003B-4C`, `003B-4B-3`, `003B-4B-4`, and `TASK-005` remain `- [ ]`.

## Standards applied

`sdd/reviews/20261122-sol-pr358-architecture.md`: a PID 1 attest of one boundary stays inside the harness and leaves `003B-4C`, `Ready`, and HTTP open. That review also records why `RemainAfterExit` after `SELF_TEST` empties the live process, so a later kill attest has to freeze `MainPID` before the cgroup disappears. `sdd/reviews/20261124-sol-pr360-architecture.md`: `KillMode=control-group` is derived inside `worker_properties`; `MemoryOOMGroup` and `OOMPolicy` stay out of `StartTransientUnit` because PID 1 returns `PropertyReadOnly`; a full cgroup-termination attest beyond that OOM stayed inside open `003B-4C`. `sdd/reviews/20261122-sol-pr346-architecture.md`: `CPUQuota` stays unset after PID 1 rejected it. The checkbox rule in those reviews still applies: `plan.md` stays `[ ]` until the whole `003B-4C` gate is done. Closed unit kinds stay `UnitKind` / `UnitState`. `KillSignal` is an internal property integer, not a new string state in a view. Android architecture standards and the Spring/Kotlin backend standards do not apply to the behavior under review: the diff has no ViewModel, UiState, controller, or Kotlin change.

## Findings

No P0. No P1. No P2. No P3.

## Residuals (not findings)

- `003B-4B-3`, `003B-4B-4`, aggregate `003B-4B`, `003B-4C`, `003B-4`, `MEDIA-NORMALIZE-004`, TASK-005, and #7 stay open. No `Ready`, no catalog HTTP, no secrets, no deploy. This review does not check off `003B-4C`, Ready, HTTP, TASK-005, `003B-4B-3`, or `003B-4B-4`.
- Remaining `003B-4C` after this cut: `CPUQuota` (PID 1 previously rejected it; it is still unset), global quota, terminals without ACK, FD/mmap after seal, restart on every durable transition, namespaces, socket family, and RLIMIT. This diff does not add them.
- `MemoryOOMGroup` and `OOMPolicy` stay absent. Production `StartTransientUnit` still does not set `memory.oom.group`. ADR-001 still requires that file, `CPUQuota`, and the rest of the Ready list before `Ready`.
- The harness `cgroup.procs` write runs only if `AttachProcessesToUnit` fails. It is test-only. It does not add a client property.
- The unit test matches `KillSignal` by a debug form that contains `9`. The PID 1 attest reads the effective property as `9` or `SIGKILL`. `CPUQuota` still has no negative assertion in that unit test; a repo search of `backend/media-broker` finds no `CPUQuota`.
- `meta.md` is not in the diff and is not updated to head `0a02b583`. The implementation banner and progress carry this cut. That matches the earlier feature cuts, which updated `meta.md` when the reviews were persisted.
- This review file is not a GitHub approval, a merge, or a `Ready` declaration, and it does not mark `003B-4C` closed.

## Conclusion

Head `0a02b5834a9b1a8ae325caf041746dab18d499db` derives `KillMode=control-group` and `KillSignal=SIGKILL` (`9i32`) inside `worker_properties`. The client does not supply them. `MemoryOOMGroup`, `OOMPolicy`, and `CPUQuota` stay out of `StartTransientUnit`. The PID 1 harness freezes `MainPID`, attaches a stopped `sleep` for job `[0xbb; 16]`, continues it, and requires `StopUnit` to reap it with `waitpid`. `003B-4C`, `Ready`, and HTTP stay open. Verify `45534853760` is success 7/7 on this SHA, none cancelled, and `media-broker-pid1` `138938915896` passed `pid1_stop_kills_extra_cgroup_process` (`10 passed; 0 failed`). No P0–P3. `APPROVED` for the architecture lane. This file is not a GitHub approval and does not mark `003B-4C` closed.
