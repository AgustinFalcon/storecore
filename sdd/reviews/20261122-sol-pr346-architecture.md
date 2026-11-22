VERDICT: APPROVED

## Evidence identity

- provider: xAI
- model: Grok 4.7
- effort: medium
- substitute-for: gpt-5.6-sol-medium
- lane: architecture
- PR: 346 `feat(media): derive worker MemoryMax, swap, tasks and CPU quota`
- head SHA: `caed99fb14c9c8c3b50200f95cfce2717f8394a9`
- base SHA: `1bec2c3b04e91f97ec56e806c88d30de3f53e77d` (`origin/master`; `git merge-base origin/master HEAD` is the same SHA)
- Verify: `44984436471` 7/7 success, none cancelled (`headSha` `caed99fb14c9c8c3b50200f95cfce2717f8394a9`)
- this file is not a GitHub approval and does not mark `003B-4C` closed

## Job conclusions

`gh run view 44984436471`: conclusion `success`, event `pull_request`, status `completed`, head `caed99fb14c9c8c3b50200f95cfce2717f8394a9`, title `feat(media): derive worker MemoryMax, swap, tasks and CPU quota`. Seven jobs, each conclusion `success`, none `cancelled`:

- repository-hygiene: success (`137091805641`)
- backend: success (`137091852465`)
- media-broker-pid1: success (`137091852477`)
- unified-access-real-e2e: success (`137091852478`)
- productive-routes-real-e2e: success (`137091852480`)
- frontend: success (`137091852490`)
- media-broker: success (`137091852571`)

`media-broker-pid1` is the job that runs the ignored harness. Both worker tests call `assert_worker_cgroup_v2`, which requires `memory.max` = `201326592` (`192 * 1024 * 1024`), `memory.swap.max` = `0`, and `pids.max` = `64`.

## Why this cut

PR #346 adds three derived systemd limits on the transient worker service and has PID 1 read them back from the unit cgroup. `003B-4C` stays `[ ]`. The plan still requires a real Linux harness with UID A and UID B, both `SELF_TEST` and `NORMALIZE` inside the unit, effective cgroup v2/mount/quota, job isolation, and failure/restart attestation. Installing `MemoryMax`, `MemorySwapMax`, and `TasksMax` and reading the three cgroup files does not close that gate. There is no `Ready` and no catalog HTTP.

The GitHub title and the opening summary still say `CPUQuota=100%`. Commit `caed99fb` (`fix(media): drop CPUQuota and MemoryOOMGroup from the first quota cut`) removed both after `StartTransientUnit` returned Unavailable. The tree matches that commit: no `CPUQuota`, no `MemoryOOMGroup`, and STATUS/progress say `CPUQuota` stays out of this cut.

## Focused validation

- `gh pr view 346`: open, base `master` `1bec2c3b04e91f97ec56e806c88d30de3f53e77d`, head `feat/media-broker-4c-quota-20261122` `caed99fb14c9c8c3b50200f95cfce2717f8394a9`, three commits, three files, +70/−7. The body says the client does not supply the properties and that the cut does not close `003B-4C`, isolation, a UID A process, `Ready`, or HTTP. Its summary line still lists `CPUQuota=100%`; the third commit and the in-repo text do not.
- `git diff --stat origin/master...HEAD` is `backend/media-broker/src/dbus.rs` (+55/−1), `sdd/STATUS.md` (+8/−6), and WIP `progress.md` (+8). No Kotlin, Angular, workflow, migration, fixture, or `meta.md` change.
- `plan.md` is not in the diff. On this SHA `MEDIA-NORMALIZE-003B-4C` is still `- [ ]` (UID A/UID B, SELF_TEST/NORMALIZE, cgroup v2/mount/quota, job isolation, failures and restarts). `003B-4B-3`, `003B-4B-4`, `MEDIA-NORMALIZE-003B-4`, and `TASK-005` stay `- [ ]`. This review does not check any of them.
- `sdd/STATUS.md` banner is `4C cuota efectiva del worker`. It says this cut does not close `003B-4C`. It names internal `MemoryMax=192MiB`, `MemorySwapMax=0`, and `TasksMax=64`, and an attest of `memory.max` / `pids.max`. It still lacks `CPUQuota`, job isolation, a UID A process, and `Ready`. `003B-4B-3`, `003B-4B-4`, `003B-4C`, `003B-4`, TASK-005, and #7 siguen abiertos. Este corte no agrega HTTP. The previous `Master vigente` paragraph is unchanged and still describes merge `c2d0413` / candidate `de9f964` as a cgroup read without a quota.
- `progress.md` records the same three derived properties, says the client does not supply them, says `CPUQuota` is outside this cut, and says PID 1 attests `memory.max`, `memory.swap.max=0`, and `pids.max`. It says `003B-4C` is not marked. No isolation, UID A process, `Ready`, or HTTP.
- `meta.md` is unchanged. Its latest broker sentence is still PR #342 (`ControlGroup`, no quota). That sentence is the master history, not a claim about this head.
- A repo search of `backend/media-broker` finds no `CPUQuota`, `MemoryOOMGroup`, `MemoryHigh`, or `CPUAccounting`.
- The diff uses `Ready` and HTTP only to say they are absent. No production path declares `Ready`. No `store_id` and no shared runtime.

## Implementation

`worker_properties` takes only `&TransientUnits`. `MemoryMax`, `MemorySwapMax`, and `TasksMax` are constants (`WORKER_MEMORY_MAX_BYTES` = `192 * 1024 * 1024`, `WORKER_TASKS_MAX` = `64`, swap `0u64`), plus `MemoryAccounting` and `TasksAccounting`. They are not read from the spec and there is no client property bag. `start_transient` still passes `properties(kind, spec)` only. Mount properties are unchanged. Production `attest` still returns `ActiveState` only; the cgroup read stays inside the ignored PID 1 tests.

`derived_properties_never_include_a_client_exec_or_where` asserts the five new keys and that the `MemoryMax` debug form contains `201326592`. The `MemorySwapMax` unit check is that the debug form contains the character `0`. The exact swap and task ceilings are the PID 1 asserts: `memory.max` equals the constant’s decimal form, `memory.swap.max` equals `0`, and `pids.max` equals `64`. Both `pid1_starts_worker_self_test_on_derived_tmpfs` and `pid1_starts_worker_normalize_on_derived_tmpfs` call that assert. The memory controller check (`cgroup.controllers` contains `memory`) is unchanged.

Property names stay D-Bus wire tokens inside the broker. `UnitKind` is still the closed match (`Mount`, `Worker`, `Unknown`). No view compares a new status string. No second translator.

The banner calls the cut a cuota efectiva because PID 1 observes the limits on the live worker cgroup, not only in the property list. It does not show a kill at the ceiling, a second job’s cgroup, a restart, or a backend process running as UID A. STATUS says those remain open.

## Findings

No P0. No P1. No P2. No P3.

## Residuals

`003B-4B-3`, `003B-4B-4`, `003B-4C`, `003B-4`, TASK-005, and #7 stay open. `plan.md` still requires, before `003B-4C` can close, effective cgroup v2 quota and mount, job isolation, failure and restart attestation, and UID A with UID B. This head sets three worker limits and reads them back. It does not set `CPUQuota`. The GitHub title and summary still name that quota; the tree does not, and a later persist should follow the tree. `Ready` and HTTP stay out. This file is not a GitHub approval and does not mark `003B-4C` closed.
