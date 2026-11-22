VERDICT: APPROVED

## Evidence identity

- provider: xAI
- model: Grok 4.7
- effort: medium
- substitute-for: gpt-5.6-sol-medium (authorized substitute; no quota)
- lane: security
- PR: 342 `feat(media): attest PID 1 worker cgroup v2 memory controller`
- head SHA: `de9f964a6fc0a9aaa1d0b54d67419903dbf0c178`
- base SHA: `4c430fcd2a3bd25b1deddf23e6f85619392e9203` (`origin/master`; merge-base is this SHA)
- Verify: `44975913833` 7/7 success, none cancelled
- head SHA of the run matches this review
- independent of the architecture lane; this file is not a GitHub approval and does not mark `003B-4C` closed

`gh pr view 342`: open, base `master` `4c430fcd2a3bd25b1deddf23e6f85619392e9203`, head `feat/media-broker-4c-cgroup-v2-20261122` `de9f964a6fc0a9aaa1d0b54d67419903dbf0c178`, two commits, three files, +50/−5. The body says the PID 1 harness attests the worker `.service` cgroup v2 (`memory` and `memory.current`), does not set a quota, does not isolate jobs, does not run a UID A process, and does not close `003B-4C`. It claims no HTTP, no `Ready`, and no data injection.

## Job conclusions

`gh run view 44975913833`: conclusion `success`, event `pull_request`, status `completed`, head `de9f964a6fc0a9aaa1d0b54d67419903dbf0c178`, title `feat(media): attest PID 1 worker cgroup v2 memory controller`. Seven jobs, each conclusion `success`, none `cancelled`:

- repository-hygiene: success (`137065671970`)
- media-broker-pid1: success (`137065716991`)
- media-broker: success (`137065717007`)
- backend: success (`137065717008`)
- productive-routes-real-e2e: success (`137065717010`)
- frontend: success (`137065717024`)
- unified-access-real-e2e: success (`137065717059`)

Job `137065716991` log: `cargo test --locked --all-targets -- --ignored --test-threads=1 pid1_` reported `pid1_starts_and_stops_derived_tmpfs_mount`, `pid1_starts_worker_normalize_on_derived_tmpfs`, and `pid1_starts_worker_self_test_on_derived_tmpfs` all `ok`. That cargo invocation finished `3 passed; 0 failed; 0 ignored`.

## Why this cut

`plan.md` is not in the diff. At this SHA `MEDIA-NORMALIZE-003B-4C` is still `- [ ]`: a real Linux harness with UID A and UID B, `SELF_TEST` and `NORMALIZE` inside the unit, and effective cgroup v2, mount, quota, job isolation, failure, and restart attestation. Mocks and a direct jar run do not close that gate. Reading `memory` and `memory.current` on the live unit cgroup does not set a quota and does not check the box.

## Focused validation

`git diff 4c430fcd2a3bd25b1deddf23e6f85619392e9203..de9f964a6fc0a9aaa1d0b54d67419903dbf0c178` is three paths, +50/−5:

- `backend/media-broker/src/dbus.rs` (+37, test module only)
- `sdd/STATUS.md`
- `sdd/wip/20261116-catalog-media-upload-and-variant-gallery/4-implementation/progress.md`

No Kotlin, Java, or TypeScript. No HTTP route, controller, or client. The diff has no password, token, API key, private key, `Authorization` header, or `store_id`. `Ready` does not appear as a new assignment. `plan.md` stays `- [ ]` on `MEDIA-NORMALIZE-003B-4C`.

`assert_worker_cgroup_v2` runs only from the two ignored PID 1 worker tests, after `start_transient` returns and before `wait_for_worker_result`. It asks systemd for that unit's `ControlGroup` (`systemctl show <derived-name> -p ControlGroup --value`) and joins the value under `/sys/fs/cgroup`. It then reads `cgroup.controllers` and `memory.current`. The unit name is `spec.worker().name()`, derived from the job id (`storecore-media-<hex>.service` in `unit.rs`), and it is passed as an argv element. The client does not supply that name.

The function does not write. It does not open `memory.max`, `memory.high`, or any other quota file. A repo search of `backend/media-broker` finds no `MemoryMax`, `memory.max`, or quota string. `worker_properties` is outside the diff and still builds a fixed list of `&'static str` keys (`ExecStart`, `User`, `Group`, `NoNewPrivileges`, `ProtectSystem`, `ReadWritePaths`, `Environment`, and the rest already on master). There is no `MemoryMax` and no client property bag. `StartTransientUnit` still receives only `properties(kind, spec)`. `derived_properties_never_include_a_client_exec_or_where` is unchanged. Production `attest` still reads `ActiveState` only.

The PID 1 tests still require `geteuid() == 0`. The worker principal in those tests is still `Principal::create(2102, 2102)`. UID 2101 remains the owner stamped on `request.bin` and `input.bin`. The new assert does not spawn a process as 2101 and does not read `cgroup.procs`.

STATUS banner is `4C atesta cgroup v2 del worker` and the next sentence says this cut does not close `003B-4C`. It says the harness reads the worker `.service` cgroup (`cgroup.controllers` memory and `memory.current`), does not set a quota, does not isolate jobs, and does not run a UID A process. `003B-4B-3`, `003B-4B-4`, `003B-4C`, `003B-4`, TASK-005, and #7 stay open. The banner says this cut adds no HTTP. `progress.md` says `003B-4C` is not marked and names no effective quota, no isolation, no UID A process, no `Ready`, and no HTTP.

`progress.md` also says the directory is in `system.slice`. The assert does not compare the `ControlGroup` string to that prefix. It accepts the path systemd reports for the derived unit, provided the joined directory exists, lists `memory`, and has an integer `memory.current`. On this Verify run both worker tests passed, so PID 1 did return a live cgroup for those units. The missing prefix check does not let a client choose the path and does not write a quota. It is not a closure of `003B-4C`.

## Findings

No P0. No P1. No P2. No P3.

The delta reads the worker unit cgroup from systemd and then from `/sys/fs/cgroup`. It does not write a quota, does not take client properties, and does not add HTTP, secrets, or `Ready`. It does not check off `003B-4C` and does not add a UID A process.

## Residuals

UID A as a process stays open. Quota stays unset. Isolation between jobs stays open. `003B-4B-3`, `003B-4B-4`, `003B-4C`, `003B-4`, TASK-005, and #7 stay open. No HTTP and no `Ready`. This file is not a GitHub approval and does not mark `003B-4C` closed.
