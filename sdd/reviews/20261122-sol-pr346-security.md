VERDICT: APPROVED

## Evidence identity

- provider: xAI
- model: Grok 4.7
- effort: medium
- substitute-for: gpt-5.6-sol-medium (authorized substitute; no quota)
- lane: security
- PR: 346 `feat(media): derive worker MemoryMax, swap, tasks and CPU quota`
- head SHA: `caed99fb14c9c8c3b50200f95cfce2717f8394a9`
- base SHA: `1bec2c3b04e91f97ec56e806c88d30de3f53e77d` (`master`; merge-base is this SHA)
- Verify: `44984436471` 7/7 success, none cancelled (`headSha` `caed99fb14c9c8c3b50200f95cfce2717f8394a9`)
- independent of the architecture lane; this file is not a GitHub approval and does not mark `003B-4C` closed

`gh pr view 346`: open, base `master` `1bec2c3b04e91f97ec56e806c88d30de3f53e77d`, head `feat/media-broker-4c-quota-20261122` `caed99fb14c9c8c3b50200f95cfce2717f8394a9`, three commits, three files, +70/−7. The body says the cut derives `MemoryMax=192MiB`, `MemorySwapMax=0`, `TasksMax=64`, and `CPUQuota=100%`, that PID 1 attests the cgroup files, and that the client does not supply those properties. It also says the cut does not close `003B-4C`, job isolation, a UID A process, `Ready`, or HTTP. The `CPUQuota=100%` sentence matches the first commit and does not match the tree at `caed99f`. That commit message drops `CPUQuota` and `MemoryOOMGroup` because `StartTransientUnit` rejected the earlier bag as `Unavailable`. `sdd/STATUS.md` at this SHA says `CPUQuota` stays out.

## Job conclusions

`gh run view 44984436471`: conclusion `success`, event `pull_request`, status `completed`, head `caed99fb14c9c8c3b50200f95cfce2717f8394a9`, title `feat(media): derive worker MemoryMax, swap, tasks and CPU quota`. Seven jobs, each conclusion `success`, none `cancelled`:

- repository-hygiene: success (`137091805641`)
- backend: success (`137091852465`)
- media-broker-pid1: success (`137091852477`)
- unified-access-real-e2e: success (`137091852478`)
- productive-routes-real-e2e: success (`137091852480`)
- frontend: success (`137091852490`)
- media-broker: success (`137091852571`)

`media-broker-pid1` runs `cargo +1.100.0 test --locked --all-targets -- --ignored --test-threads=1 pid1_`. That filter includes `pid1_starts_worker_self_test_on_derived_tmpfs` and `pid1_starts_worker_normalize_on_derived_tmpfs`. Both call `assert_worker_cgroup_v2` before they accept the worker result. The step `Start derived tmpfs and worker units through PID 1` completed success on this SHA.

## Why this cut

`plan.md` is not in the diff. At this SHA `MEDIA-NORMALIZE-003B-4C` is still `- [ ]`: a real Linux harness with UID A and UID B, `SELF_TEST` and `NORMALIZE` inside the unit, and effective cgroup v2, mount, quota, job isolation, failure, and restart attestation. Memory, swap, and task ceilings on the worker unit do not check that box.

`003B-4B-3` stays open as well: the daemon, the approved runtime, and PID 1 transient units that do not accept client commands, paths, or properties. This cut adds three worker ceilings inside the existing derived property list. It does not close that task.

## Focused validation

`git diff 1bec2c3b04e91f97ec56e806c88d30de3f53e77d...caed99fb14c9c8c3b50200f95cfce2717f8394a9` is three paths, +70/−7:

- `backend/media-broker/src/dbus.rs`
- `sdd/STATUS.md`
- `sdd/wip/20261116-catalog-media-upload-and-variant-gallery/4-implementation/progress.md`

`git diff` on `3-tasks/plan.md` is empty. No workflow, Kotlin, Angular, migration, fixture, or `systemd.rs` change. `TransientUnits::derive` still takes only `job_id`, `mount_root`, `Principal`, and `ApprovedRuntime`. It has no memory, swap, or task field.

`worker_properties` appends five fixed entries to the existing vec. The keys are `'static` strings. The values are `MemoryAccounting=true`, `MemoryMax=WORKER_MEMORY_MAX_BYTES` (`192 * 1024 * 1024`, 201326592), `MemorySwapMax=0u64`, `TasksAccounting=true`, and `TasksMax=WORKER_TASKS_MAX` (`64`). Those two constants sit next to the other broker literals. The function does not read them from `spec`, from `Principal`, or from any request frame. `properties()` still chooses `mount_properties` or `worker_properties` and nothing else. `start()` still passes that vec to `StartTransientUnit` with an empty auxiliary array. The mount property list is unchanged and does not gain these keys. `tmpfs_options` remains the pre-existing `size=48M` string.

The non-ignored test `derived_properties_never_include_a_client_exec_or_where` builds a spec with `Principal::create(2000, 2000)` and checks that the worker bag contains the five keys. It checks that the `MemoryMax` debug text contains `201326592`. It checks `MemorySwapMax` only by seeing whether that debug text contains the character `0`. It does not assert `TasksMax == 64`. That substring is not the security evidence. The evidence is the PID 1 read of the cgroup files, below.

`assert_worker_cgroup_v2` asks PID 1 for `ControlGroup` of the derived worker unit, joins that path under `/sys/fs/cgroup`, and requires the directory to exist. It requires `memory` in `cgroup.controllers`. It then requires `memory.max` to equal `WORKER_MEMORY_MAX_BYTES`, `memory.swap.max` to equal `0`, and `pids.max` to equal `WORKER_TASKS_MAX`. Those comparisons are exact trimmed file text, not a substring. Both ignored worker tests call this after `start_transient(UnitKind::Worker, &spec)` and before they accept `result.bin`. The harness still checks `/proc/1/comm` is `systemd` and that the effective uid is 0. `User` and `Group` stay the pre-existing numeric principal (`2102` in this harness). This cut does not add a UID A process.

No HTTP route, controller, or client. The word HTTP appears only in sentences that say this cut adds none. `Ready` appears only as still out of scope. The diff contains no password, token, API key, private key, `Authorization` header, or `store_id`. `dbus.rs` has no `Ready`, no URL, and no secret literal. There is no `Delegate` property, so this bag does not hand the worker the right to rewrite its own cgroup files. There is no `CPUQuota` and no `MemoryOOMGroup` in the reviewed tree.

`STATUS.md` says this document does not close `003B-4C`. It names the internal ceilings and the `memory.max` / `pids.max` attestation, and it leaves out `CPUQuota`, job isolation, a UID A process, and `Ready`. `003B-4B-3`, `003B-4B-4`, `003B-4C`, `003B-4`, TASK-005, and #7 stay open. `progress.md` records the same boundaries and also names `memory.swap.max=0`. The implementation banner does not claim the swap file; the harness does assert it. That is a narrower status sentence, not a false claim that swap is unlimited.

## Findings

No P0. No P1. No P2. No P3.

The worker ceilings are broker literals on the derived property list. The client request does not enter that list. PID 1 attestation on this SHA reads `memory.max`, `memory.swap.max`, and `pids.max` from the worker cgroup and requires the derived values. The diff adds no HTTP, no secret, and no `Ready`. `003B-4C` stays unchecked, and a UID A process stays unadded.

The GitHub body still names `CPUQuota=100%`. The tree and `STATUS.md` do not. That mismatch is outside the diff and does not put a CPU quota into the unit.

## Residuals

`CPUQuota` stays unset. `MemoryOOMGroup` stays unset after the rejected bag. Isolation between jobs stays open. UID A as a process stays open. `003B-4B-3`, `003B-4B-4`, `003B-4C`, `003B-4`, TASK-005, and #7 stay open. No HTTP and no `Ready`. This file is not a GitHub approval and does not mark `003B-4C` closed.
