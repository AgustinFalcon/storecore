VERDICT: APPROVED

## Evidence identity

- provider: xAI
- model: Grok 4.7
- effort: medium
- substitute-for: gpt-5.6-sol-medium (no quota)
- lane: security
- independent of the architecture lane
- PR: 366 OPEN https://github.com/AgustinFalcon/storecore/pull/366
- head: `0a02b5834a9b1a8ae325caf041746dab18d499db`
- `git rev-parse HEAD` matches that SHA on `feat/media-broker-4c-cgroup-kill-20261124`
- `origin/master` at review time: `ac92b03e3dcbfc89de804ce2f50bf30d46e0e316` (PR #372)
- merge-base with this branch: `7c2a819470ea614d4750b96afd88150a09aab5b7` (persist #365)
- Verify: `45534853760` exact-head 7/7 `completed` / `success`, event `pull_request`, none cancelled
- this file is not a GitHub approval
- this review does not close `003B-4C`, does not mark Ready, and does not add HTTP

## Job conclusions (Verify 45534853760)

headSha `0a02b5834a9b1a8ae325caf041746dab18d499db`. Run conclusion `success`. No job cancelled.

- repository-hygiene `138938834998`: `completed` / `success`
- backend `138938915832`: `completed` / `success`
- frontend `138938915842`: `completed` / `success`
- media-broker-pid1 `138938915896`: `completed` / `success`
- media-broker `138938915914`: `completed` / `success`
- unified-access-real-e2e `138938915957`: `completed` / `success`
- productive-routes-real-e2e `138938915978`: `completed` / `success`

`media-broker-pid1` runs `cargo +1.100.0 test --locked --all-targets -- --ignored --test-threads=1 pid1_`, which includes `pid1_stop_kills_extra_cgroup_process`. That job's PID 1 step completed success on this SHA.

## Why this cut

`gh pr view 366`: open, title `feat(media): attest PID 1 KillMode stop kills cgroup members`. The body says the PID 1 harness starts the derived worker, attests `KillMode=control-group`, injects a `sleep` into the worker cgroup, and requires `StopUnit` to reap it. It says the client still cannot supply exec, `Where`, or limits, that `CPUQuota`, `MemoryOOMGroup`, and `OOMPolicy` stay unset on `StartTransientUnit`, and that this cut does not close `003B-4C`, Ready, or HTTP. Those sentences match the tree.

`plan.md` is not in the diff. At this SHA `MEDIA-NORMALIZE-003B-4C` is still `- [ ]`: a real Linux harness with UID A and UID B, `SELF_TEST` and `NORMALIZE` inside the unit, and effective cgroup v2, mount, quota, job isolation, failure, and restart attestation. One `StopUnit` reap of an injected sleeper does not check that box. `003B-4B-3`, `003B-4B-4`, `MEDIA-NORMALIZE-003B-4`, and TASK-005 stay `- [ ]`. The plan still says none of those cuts enable HTTP, a live provider, secrets, deploy, or homologation.

`STATUS.md` on this head says the harness freezes `MainPID`, attaches a `sleep`, derives `KillSignal=SIGKILL`, and attests that `StopUnit` with `KillMode=control-group` kills it, and that the document does not close `003B-4C`. `CPUQuota` and `Ready` stay out. `progress.md` records the same boundary and the `waitpid` reap. The historical "master vigente" banners under the new section still describe older masters without this kill attest. They do not check the plan box.

Prior security reviews applied here:

- `sdd/reviews/20261122-sol-pr358-security.md` left cgroup kill, `CPUQuota`, Ready, and HTTP open, and required `RuntimeMaxUSec` / `TimeoutStopUSec` to stay internal constants on a fixed frame. This cut adds the kill attest. It does not add a client property bag, and it does not close `003B-4C`.
- `sdd/reviews/20261122-sol-pr355-security.md` required `TransientUnits::derive` to keep only job id, mount root, principal, and approved runtime, and `confirm()` before `StartTransientUnit`. `daemon.rs`, `runtime.rs`, and `systemd.rs` are outside this diff. `BrokerDaemon::start` still calls `confirm()` before `TransientUnits::derive` and before either `start_kind`.
- `sdd/reviews/20261122-sol-pr348-security.md` required no client property bag, no `Delegate`, no `CPUQuota`, and treated one PID 1 slice as not `003B-4C`. This cut stays inside that boundary. `ReadWritePaths` is still only the derived `Where`.

## Focused validation

`git diff origin/master...HEAD` (`7c2a819470ea614d4750b96afd88150a09aab5b7` to `0a02b5834a9b1a8ae325caf041746dab18d499db`) is three paths, +237/−6:

- `backend/media-broker/src/dbus.rs`
- `sdd/STATUS.md`
- `sdd/wip/20261116-catalog-media-upload-and-variant-gallery/4-implementation/progress.md`

Commits on the branch since the merge-base: `51a93f8`, `1941dd1`, `70c2fe5`, `f30c089`, `bd775b8`, `0a02b58`. No workflow, Kotlin, Angular, migration, fixture, `daemon.rs`, `runtime.rs`, or `systemd.rs` change.

`worker_properties` appends `KillSignal` as the `'static` key with `Value::from(9i32)` next to the existing literal `KillMode=control-group`. Both sit in the same fixed vector as `ExecStart` (approved `java -jar`), `User`/`Group` from the derived principal, `NoNewPrivileges=true`, `ProtectSystem=strict`, `ReadWritePaths` equal to the derived workspace, `MemoryMax`, `MemorySwapMax=0`, `TasksMax=64`, `RuntimeMaxUSec`, and `TimeoutStopUSec`. The function does not read a request frame. `properties()` still chooses `mount_properties` or `worker_properties`. `ZbusSystemd::start` still passes that vector to `StartTransientUnit` with an empty auxiliary array. Production manager calls remain `StartTransientUnit`, `StopUnit`, and `GetUnit` plus `ActiveState`.

`TransientUnits::derive` still takes only `job_id`, `mount_root`, `Principal`, and `&ApprovedRuntime`. It has no property bag. Unit names, `Where`, and `ExecStart` stay derived. The new PID 1 test builds the spec with `JobId::create([0xbb; 16])`, mount root `/run/storecore_media/jobs`, `Principal::create(2102, 2102)`, and `approved_pid1_runtime()`. The unit name passed to `busctl` is `spec.worker().name()`, not a client string.

`derived_worker_oom_kills_the_cgroup` requires `KillMode` and `KillSignal` and rejects `MemoryOOMGroup` and `OOMPolicy` in the derived keys. A repo search of `backend/media-broker/src` finds no `CPUQuota` and no `store_id`. The reviewed vector has no `Delegate`, no `CPUQuota`, no `MemoryOOMGroup`, and no `OOMPolicy`.

`AttachProcessesToUnit`, the `busctl` invocation, and the `cgroup.procs` fallback write live in `attach_pid_to_unit`, which is inside `#[cfg(test)] mod tests` and is reached only from `#[ignore]` `pid1_stop_kills_extra_cgroup_process` via `spawn_cgroup_sleeper`. The pre-existing `oom_worker_cgroup` write of `cgroup.procs` is the same test module and is only used by the ignored OOM PID 1 test. Neither call is on the production allowlist.

The new harness requires `/proc/1/comm` to be `systemd` and euid 0. It freezes the derived unit `MainPID`, reads back `KillMode=control-group` and `KillSignal` as `9` or `SIGKILL`, moves its own stopped `sleep 60` into that cgroup, continues it, calls `StopUnit`, and reaps the child with `try_wait` / `wait` inside 8 seconds. `kill` and `busctl` are not on the daemon start path.

No HTTP route, controller, upload, or client. The word HTTP appears only in sentences that say this cut adds none. `Ready` appears only as still out of scope. The diff contains no password, token, API key, private key, `Authorization` header, `store_id`, `TenantFilter`, or deploy step. `3-tasks/plan.md` is unchanged, so `003B-4C` stays unchecked.

`progress.md` still names a rebase onto `4b0e06a`. That commit is an ancestor of this head. The merge-base with today's `origin/master` (`ac92b03`, PR #372) is the later persist commit `7c2a819`. The three-dot diff does not contain the calendar HTTP commits that sit only on current master.

Untracked local reviews `sdd/reviews/20261124-sol-pr365-architecture.md` and `sdd/reviews/20261124-sol-pr365-security.md` are outside this PR. They were not staged.

## Findings

No P0. No P1. No P2. No P3.

`KillMode=control-group` and `KillSignal=9` are internal literals on the derived worker vector. `StartTransientUnit` receives only that vector. The client cannot supply `ExecStart`, `Where`, the unit name, or a property bag. `AttachProcessesToUnit` / `busctl` / `cgroup.procs` writes stay in `#[ignore]` PID 1 tests. `MemoryOOMGroup` and `OOMPolicy` stay off `StartTransientUnit`. `CPUQuota` stays unset. The diff adds no HTTP, no secret, no `store_id`, no shared runtime, no deploy, and no `Ready`. `003B-4C` stays unchecked.

## Residuals (not findings)

`003B-4C` stays open: UID A/UID B, `NORMALIZE` inside the unit, quota, cross-job isolation, failure, and restart are not this one sleeper reap. `CPUQuota` stays unset. `MemoryOOMGroup` and `OOMPolicy` stay unset on `StartTransientUnit`; the OOM attest remains the pre-existing harness write of `memory.oom.group`. Explicit stop now sends SIGKILL to the control group, so the worker has no SIGTERM handler window on that path. That signal is the internal constant, not a client value. `003B-4B-3`, `003B-4B-4`, `003B-4C`, `003B-4`, TASK-005, and #7 stay open. No HTTP and no `Ready`. This file is not a GitHub approval and does not mark `003B-4C` closed.
