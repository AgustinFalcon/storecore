VERDICT: APPROVED

## Evidence identity

- provider: xAI
- model: Grok 4.7
- effort: medium
- substitute-for: gpt-5.6-sol-medium (no quota)
- lane: architecture
- independent of the security lane
- PR: 360 OPEN `feat(media): attest PID 1 MemoryMax OOM-kills the worker cgroup` https://github.com/AgustinFalcon/storecore/pull/360
- branch: `feat/media-broker-4c-oom-20261122`
- head SHA: `873cffc8d71d7860b770f0802bec0e51b1cc93a2`
- `git rev-parse HEAD`: `873cffc8d71d7860b770f0802bec0e51b1cc93a2` (matches GitHub `headRefOid`)
- base SHA / `origin/master`: `493a582f5caad9b8564d680dc8cf5c6f3d0d23dd` (`git rev-parse origin/master`; GitHub `baseRefOid` matches). That commit is PR #362, phase one commercial coordination. Its first parent is `862e5248841025254f4d8a51db543c39cb1aef12` (PR #361 showcase presentation). `git merge-base origin/master HEAD` is that same base. First parent of HEAD is `c8f251e5952b83e86121c2ec3847f7c3d561fb8a`.
- Verify on this head: run `45472580402` (`pull_request`, name `Verify`, status `completed`, conclusion `success`, `headSha` `873cffc8d71d7860b770f0802bec0e51b1cc93a2`). 7/7 success. None cancelled. One Verify run on this SHA. Billing was not an exception on this run.
- local cargo: not run. This host is Windows. The new PID 1 test is `#[ignore]` and runs in `media-broker-pid1`. Focused validation is that hosted Verify run. Its log records `dbus::tests::pid1_worker_memory_max_oom_kills_cgroup ... ok` and `test result: ok. 9 passed; 0 failed; 0 ignored; 0 measured; 62 filtered out`.
- this file is not a GitHub approval and does not mark `003B-4C` closed

## Job conclusions (Verify 45472580402)

Seven jobs, all `completed` / `success` on `873cffc8d71d7860b770f0802bec0e51b1cc93a2`. None cancelled:

- repository-hygiene: success (`138724203687`)
- backend: success (`138724316888`)
- media-broker: success (`138724315784`)
- media-broker-pid1: success (`138724315562`)
- frontend: success (`138724315543`)
- productive-routes-real-e2e: success (`138724315728`)
- unified-access-real-e2e: success (`138724315461`)

`media-broker-pid1` `138724315562` is the job that executed `pid1_worker_memory_max_oom_kills_cgroup`. The dbus binary finished `9 passed; 0 failed`.

## Diff reviewed

`git diff origin/master...HEAD`: 3 files, +238 / −8. Seven commits on `493a582f5caad9b8564d680dc8cf5c6f3d0d23dd`:

- `c6bf07e3447047ebc07d649416db2f5d3ac605cb` `feat(media): attest PID 1 MemoryMax OOM-kills the worker cgroup`
- `05568cee3ec34c3a179d4dfc3c59350107405b02` `fix(media): rustfmt OOM harness imports and cgroup write`
- `839795fda3d158ab96e5228cb7e42585eb419377` `fix(media): keep OOM probe size inside PID 1 tests`
- `9b50aa8910f747cda367f22abc23bd93b27f39ff` `fix(media): drop OOMPolicy after PID 1 StartTransientUnit reject`
- `b7f829104ff121998ab4305ae47f4946d229bbc4` `fix(media): print StartTransientUnit D-Bus error in PID 1 dump`
- `c8f251e5952b83e86121c2ec3847f7c3d561fb8a` `fix(media): drop MemoryOOMGroup D-Bus and set cgroup oom.group`
- `873cffc8d71d7860b770f0802bec0e51b1cc93a2` `docs: record master 493a582 PRs 361 and 362 under open 4C OOM cut`

| File | change |
| --- | --- |
| `backend/media-broker/src/dbus.rs` | `worker_properties` gains internal `KillMode=control-group`. `MemoryOOMGroup` and `OOMPolicy` are absent. Unit test locks that bag. Ignored PID 1 test freezes `MainPID`, writes `memory.oom.group=1` on the worker cgroup, injects a 256 MiB allocator, and waits for `oom-kill` with no `result.bin` |
| `sdd/STATUS.md` | implementation banner names the `PropertyReadOnly` exclusion, the harness cgroup write, and the frozen `MainPID`; `003B-4C` stays open; master paragraphs record `493a582` / PR #362 and `862e524` / PR #361 |
| `sdd/wip/.../4-implementation/progress.md` | same claim; `003B-4C` is not marked |

`plan.md`, `spec.md`, `meta.md`, and ADR-001 are not in the diff. No Kotlin, Angular, workflow, migration, fixture, lockfile, HTTP route, or secret.

## Why this cut

`003B-4C` in `3-tasks/plan.md` on this SHA is still `[ ]` (line 89): harness Linux real con UID A/UID B, SELF_TEST/NORMALIZE dentro de la unidad, attestación efectiva de cgroup v2/mount/quota, aislamiento entre jobs, fallos y reinicios. The spec paragraph still requires SELF_TEST/NORMALIZE, isolation, per-job and global quota, terminals without ACK, FD/mmap after seal, OOM/timeout, cgroup termination, substitution rejection, and restart on every durable transition before that gate can close. ADR-001 still requires `KillMode=control-group`, `memory.oom.group`, and `CPUQuota` before `Ready`, and still says only `4A+4B+4C` can complete `003B-4`. `003B-4B-3`, `003B-4B-4`, `MEDIA-NORMALIZE-003B-4`, and `TASK-005` stay `[ ]`.

STATUS says this cut does not close `003B-4C`. It derives `KillMode=control-group`. `MemoryOOMGroup` and `OOMPolicy` stay out of `StartTransientUnit` because PID 1 returns `PropertyReadOnly`, the same class as `CPUQuota`. The harness writes `memory.oom.group=1` on the attested worker cgroup v2, freezes `MainPID`, injects an allocator, and attests that the group dies when `MemoryMax` is exceeded. `CPUQuota` and `Ready` stay absent. No HTTP.

The GitHub PR summary still says the cut derives `MemoryOOMGroup=yes` and `OOMPolicy=kill`. That sentence is the pre-`c8f251e` claim. The tree, STATUS, progress, and the unit test are the contract: both properties stay out of `StartTransientUnit`. The PR test plan leaves Verify, the dual reviews, and the `003B-4C` checkbox unchecked. This review does not check them off and does not edit the PR body.

## Implementation

`TransientUnits::derive` still takes only `JobId`, the jobs root, `Principal`, and `&ApprovedRuntime`. Callers cannot supply unit names, `Where`, or `ExecStart`. `worker_properties` is the only worker property bag, and `properties(UnitKind::Worker)` is what `start` sends to `StartTransientUnit`. Limits stay the existing crate constants: `MemoryMax` `192 * 1024 * 1024`, `MemorySwapMax` `0`, `TasksMax` `64`, `RuntimeMaxUSec` `12_000_000`, `TimeoutStopUSec` `1_000_000`. The new key is `KillMode` with the internal literal `control-group`. The vector has no `CPUQuota`, `MemoryOOMGroup`, or `OOMPolicy`. `derived_worker_oom_kills_the_cgroup` asserts `KillMode` contains `control-group` and that the other two keys are absent. `UnitKind` / `UnitState` stay the closed unit types. A D-Bus start failure still maps to `SystemdError::Unavailable` and now also prints the PID 1 error.

`pid1_worker_memory_max_oom_kills_cgroup` is ignored unless `/proc/1/comm` is `systemd` and euid is 0. It derives job `[0xaa; 16]` and principal `2102:2102`, starts the mount, writes the existing `SELF_TEST` `request.bin`, and starts the worker through PID 1. `freeze_worker_main_pid` reads `MainPID` and sends `kill -STOP`. `systemctl` must show `KillMode=control-group`. `oom_worker_cgroup` reads `ControlGroup`, writes `memory.oom.group` to `1`, reads that value back, and moves a stopped Python allocator into `cgroup.procs` before `SIGCONT`. The probe is `WORKER_OOM_PROBE_BYTES` = 256 MiB, above the derived 192 MiB `MemoryMax`, and it touches one byte per page only after the process is inside the cgroup. `wait_oom_kill_journal` waits up to 20 s for `Result=oom-kill` or a unit journal line that records `oom-kill` (the kernel cgroup line is an additional accepted phrase). `result.bin` must still be absent. Stop of the worker and the mount accepts `Inactive` or `Failed`.

That shape matches the failed alternatives recorded in the commits. PID 1 rejected `OOMPolicy` and then `MemoryOOMGroup` on `StartTransientUnit` with `PropertyReadOnly`. The broker does not send those properties. The harness sets the cgroup v2 file on the unit cgroup it just read. The hosted job reached `ok`.

## Ledger

- `sdd/STATUS.md` banner is `4C OOM del cgroup worker`. It says this cut does not close `003B-4C`. It names internal `KillMode=control-group`, the `PropertyReadOnly` exclusion of `MemoryOOMGroup` and `OOMPolicy`, the harness write of `memory.oom.group=1`, a frozen `MainPID`, and the allocator attest. `CPUQuota` and `Ready` stay absent. `003B-4B-3`, `003B-4B-4`, `003B-4C`, `003B-4`, TASK-005, and #7 stay open. No HTTP.
- The new master paragraphs describe merged `493a582f5caad9b8564d680dc8cf5c6f3d0d23dd` / PR #362 and `862e5248841025254f4d8a51db543c39cb1aef12` / PR #361. On that merged tree, OOM is still unmarked. The implementation banner describes this unmerged candidate.
- `progress.md` records the same derivation, the same cgroup write, and that `003B-4C` is not marked. No `Ready` or HTTP.
- `plan.md` is not in the diff. `MEDIA-NORMALIZE-003B-4C`, `003B-4B-3`, `003B-4B-4`, and `TASK-005` remain `- [ ]`.

## Standards applied

`sdd/reviews/20261122-sol-pr358-architecture.md`: a PID 1 attest of one boundary stays inside the harness and leaves `003B-4C`, `Ready`, and HTTP open. `sdd/reviews/20261121-sol-pr331-architecture.md`: unit properties stay internally derived. The checkbox rule recorded from `sdd/reviews/20261121-sol-pr334-architecture.md` in those later reviews still applies: the canonical plan checkbox stays `[ ]` until the gate is actually done. Closed unit kinds stay `UnitKind` / `UnitState`. Android architecture standards and the Spring/Kotlin backend standards do not apply to the behavior under review: the diff has no ViewModel, UiState, controller, or Kotlin change. `MemoryOOMGroup` stays out of `StartTransientUnit` for the same `PropertyReadOnly` reason already applied to `CPUQuota`.

## Findings

No P0. No P1. No P2. No P3.

## Residuals (not findings)

- `003B-4B-3`, `003B-4B-4`, aggregate `003B-4B`, `003B-4C`, `003B-4`, `MEDIA-NORMALIZE-004`, TASK-005, and #7 stay open. No `Ready`, no catalog HTTP, no secrets, no deploy. This review does not check off `003B-4C`.
- `CPUQuota` stays unset. It is not in `worker_properties`. The new unit test does not add a negative assertion for it.
- Production `StartTransientUnit` does not set `memory.oom.group`. The harness writes that file on the attested worker cgroup because PID 1 rejects `MemoryOOMGroup`. ADR-001 still requires `memory.oom.group` before `Ready`. This cut does not claim that production path.
- The OOM wait also accepts the journal phrase `Memory cgroup out of memory`. `result.bin` is already blocked by `SIGSTOP` of `MainPID`. The decisive hosted signals are `KillMode=control-group`, `memory.oom.group` read back as `1`, and `oom-kill`. A full cgroup-termination attest, beyond this one OOM, remains inside open `003B-4C`.
- The GitHub PR summary still says `MemoryOOMGroup=yes` and `OOMPolicy=kill` are derived. The tree after `c8f251e` does not send them. STATUS and progress are the SDD why. This lane does not require a code change for that summary drift.
- `meta.md` is not in the diff and is not updated to head `873cffc8`. The implementation banner and progress carry this cut. That matches the earlier feature cuts, which updated `meta.md` when the reviews were persisted.
- This review file is not a GitHub approval, a merge, or a `Ready` declaration, and it does not mark `003B-4C` closed.

## Conclusion

Head `873cffc8d71d7860b770f0802bec0e51b1cc93a2` derives `KillMode=control-group` inside `worker_properties` and leaves `MemoryOOMGroup` and `OOMPolicy` out of `StartTransientUnit`. The PID 1 harness freezes `MainPID`, writes `memory.oom.group=1` on the worker cgroup v2, injects a 256 MiB allocator, and requires `oom-kill` with no `result.bin`. `CPUQuota` stays unset. The client still cannot supply `ExecStart`, `Where`, or limits. Verify `45472580402` is success 7/7 on this SHA, none cancelled, and `media-broker-pid1` `138724315562` passed `pid1_worker_memory_max_oom_kills_cgroup` (`9 passed; 0 failed`). `003B-4C`, `003B-4B-3`, `003B-4B-4`, TASK-005, `Ready`, and HTTP stay open. No P0–P3. `APPROVED` for the architecture lane. This file is not a GitHub approval and does not mark `003B-4C` closed.
