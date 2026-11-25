VERDICT: APPROVED

## Evidence identity

- provider: xAI
- model: Grok 4.7
- effort: medium
- substitute-for: gpt-5.6-sol-medium (no quota)
- lane: security
- independent of the architecture lane
- PR: 360 OPEN https://github.com/AgustinFalcon/storecore/pull/360
- title: feat(media): attest PID 1 MemoryMax OOM-kills the worker cgroup
- branch: `feat/media-broker-4c-oom-20261122`
- head: `873cffc8d71d7860b770f0802bec0e51b1cc93a2`
- base: `493a582f5caad9b8564d680dc8cf5c6f3d0d23dd` (`origin/master`)
- GitHub `headRefOid` / `baseRefOid` match those SHAs
- local `git rev-parse HEAD` and `git rev-parse origin/master` match those SHAs
- diff: `origin/master...HEAD`, 3 files, +238/−8 (`backend/media-broker/src/dbus.rs`, `sdd/STATUS.md`, `sdd/wip/20261116-catalog-media-upload-and-variant-gallery/4-implementation/progress.md`)
- Verify: `45472580402` exact-head 7/7 `completed` / `success`, none cancelled
- this file is not a GitHub approval
- this review does not close `003B-4C`, does not mark Ready, and does not add HTTP

## Job conclusions (Verify 45472580402)

headSha `873cffc8d71d7860b770f0802bec0e51b1cc93a2`. Run name `Verify`. Run status `completed`. Run conclusion `success`. No job cancelled.

- repository-hygiene `138724203687`: `completed` / `success`
- backend `138724316888`: `completed` / `success`
- media-broker `138724315784`: `completed` / `success`
- media-broker-pid1 `138724315562`: `completed` / `success`
- frontend `138724315543`: `completed` / `success`
- productive-routes-real-e2e `138724315728`: `completed` / `success`
- unified-access-real-e2e `138724315461`: `completed` / `success`

`media-broker-pid1` runs `cargo +1.100.0 test --locked --all-targets -- --ignored --test-threads=1 pid1_`, which includes `pid1_worker_memory_max_oom_kills_cgroup`.

## Why this cut

`003B-4C` in `sdd/wip/20261116-catalog-media-upload-and-variant-gallery/2-technical/spec.md` is the real Linux harness (UID A / UID B, effective cgroup, OOM/timeout, cgroup termination). `plan.md` still has `- [ ] MEDIA-NORMALIZE-003B-4C`. This diff does not edit the plan or `tasks.json`.

STATUS and progress describe an open cut: `KillMode=control-group` is derived inside `worker_properties`. `MemoryOOMGroup` and `OOMPolicy` stay off `StartTransientUnit` after PID 1 `PropertyReadOnly`. The ignored root harness writes `memory.oom.group=1`, freezes `MainPID`, moves a 256 MiB allocator into `cgroup.procs`, and requires an oom-kill journal/`Result`. `CPUQuota`, Ready, and HTTP stay out. The GitHub summary still says those two D-Bus properties are derived; the tree (code, STATUS, progress) is the evidence and matches the `PropertyReadOnly` drop.

## Controls

- `BrokerRequest` remains a fixed frame (`operation`, `job_id`, `revision`, `digest`, `size`). It has no exec, `Where`, unit name, or limit field. `TransientUnits::derive` still takes only job id, mount root, principal, and approved runtime. `ExecStart` is still approved Java, `-jar`, and the approved jar. `Where` is still the derived job path under the mount root. `StartTransientUnit` is still called only as method `"StartTransientUnit"` with `properties(kind, spec)` and an empty auxiliary vector.
- `WORKER_MEMORY_MAX_BYTES` is `192 * 1024 * 1024`. `worker_properties` sends `MemoryMax` from that constant and `MemorySwapMax` as `0u64`. The same function adds `KillMode` as the literal `"control-group"`. The property vector has no `CPUQuota`, `MemoryOOMGroup`, or `OOMPolicy`. `derived_worker_oom_kills_the_cgroup` asserts `KillMode` contains `control-group` and that those two keys are absent.
- The PID 1 test is `#[ignore]`, requires `/proc/1/comm` = `systemd` and euid 0, and starts the derived mount and worker. On start failure it dumps and stops. It SIGSTOPs the unit `MainPID` only when that pid is non-empty and not `0`, then reads back `KillMode=control-group`.
- `oom_worker_cgroup` takes `ControlGroup` from `systemctl show` of that derived unit (argv, no shell), joins it under `/sys/fs/cgroup`, writes `memory.oom.group` as `1`, and requires the read-back to be `1`. The allocator is a fixed `python3 -c` script. `WORKER_OOM_PROBE_BYTES` is `256 * 1024 * 1024`. The process SIGSTOPs before the bytearray, the harness waits for `State: T`, writes that pid into `cgroup.procs`, then SIGCONTs. The probe is above the derived 192 MiB ceiling. `mem::forget` keeps the child handle from killing the probe before the kernel does.
- `wait_oom_kill_journal` returns only on `Result=oom-kill` or a unit journal line containing `oom-kill`, `result 'oom-kill'`, `Failed with result 'oom-kill'`, or `Memory cgroup out of memory`, within 20s. The test then requires `result.bin` to be absent, and stops the worker and mount.
- `start` still maps every `StartTransientUnit` failure to `SystemdError::Unavailable`. The new `eprintln!` records the derived unit name and the zbus error. It does not add a client field, a secret, or a second D-Bus method.
- No HTTP route, credential, token, Ready flag, or `003B-4C` checkbox is in the diff.

## Residuals (not findings)

`003B-4C`, TASK-005, cgroup teardown as a product behavior, `CPUQuota`, Ready, and HTTP remain open. `memory.oom.group` is written by the root harness, not by the broker `StartTransientUnit` property list. `KillMode=control-group` is the stop/kill scope of the unit; it is not a substitute for a broker-written oom group. The OOM test does not call `assert_worker_cgroup_v2`; `MemoryMax` / `MemorySwapMax` stay on the same derived property vector that test already checks elsewhere, and the live probe is 256 MiB against that 192 MiB ceiling.

## Findings

No P0. No P1. No P2. No P3.
