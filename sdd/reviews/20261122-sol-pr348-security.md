VERDICT: APPROVED

## Evidence identity

- provider: xAI
- model: Grok 4.7
- effort: medium
- substitute-for: gpt-5.6-sol-medium (authorized substitute; no quota)
- lane: security
- PR: 348 `feat(media): isolate worker ReadWritePaths per JobId`
- head SHA: `15b9e5180014ce8649e02930e44ab3cf7309c679`
- base SHA: `37a9bb32748d8409280ed3fd92225f244395f92e` (`master`, merge of #347; merge-base is this SHA)
- Verify: `44986626639` 7/7 success, none cancelled (`headSha` `15b9e5180014ce8649e02930e44ab3cf7309c679`)
- independent of the architecture lane; this file is not a GitHub approval and does not mark `003B-4C` closed

`gh pr view 348`: open, base `master` `37a9bb32748d8409280ed3fd92225f244395f92e`, head `feat/media-broker-4c-isolation-20261122` `15b9e5180014ce8649e02930e44ab3cf7309c679`, three commits, three files, +192/−6. `git ls-remote` shows the same SHA on `refs/heads/feat/media-broker-4c-isolation-20261122` and `refs/pull/348/head`. The body says the client does not supply properties, that PID 1 attests two `SELF_TEST` workers, and that the cut does not close `003B-4C`, `CPUQuota`, a UID A process, failure/restart, `Ready`, or HTTP. Its first summary sentence still says the cut derives `InaccessiblePaths`. The tree and `STATUS.md` do not. Commit `03d6983c6de0e55778a4142cd64adafeafa34f99` drops that property after `StartTransientUnit` hid `WorkingDirectory` and PID 1 failed `CHDIR`.

## Job conclusions

`gh run view 44986626639`: conclusion `success`, event `pull_request`, status `completed`, head `15b9e5180014ce8649e02930e44ab3cf7309c679`, name `Verify`. One Verify run on this SHA. Seven jobs, each conclusion `success`, none `cancelled`, none a billing skip:

- repository-hygiene: success (`137098500206`)
- frontend: success (`137098549026`)
- backend: success (`137098549027`)
- productive-routes-real-e2e: success (`137098549029`)
- unified-access-real-e2e: success (`137098549049`)
- media-broker: success (`137098549060`)
- media-broker-pid1: success (`137098549082`)

`media-broker` runs `cargo +1.100.0 clippy --locked --all-targets -- -D warnings` and the lockfile tests. `dbus::tests::two_jobs_do_not_share_read_write_paths` passed. The broker lib result was `ok. 60 passed; 0 failed; 4 ignored`. `media-broker-pid1` runs `cargo +1.100.0 test --locked --all-targets -- --ignored --test-threads=1 pid1_`. `dbus::tests::pid1_isolates_worker_read_write_paths_per_job` passed, together with the existing mount, `NORMALIZE`, and `SELF_TEST` PID 1 tests. That result was `ok. 4 passed; 0 failed; 0 ignored; 0 measured; 60 filtered out`.

## Why this cut

`plan.md` is not in the diff. At this SHA `MEDIA-NORMALIZE-003B-4C` is still `- [ ]`: a real Linux harness with UID A and UID B, `SELF_TEST` and `NORMALIZE` inside the unit, and effective cgroup v2, mount, quota, job isolation, failure, and restart attestation. Reading `ReadWritePaths` for two `SELF_TEST` workers does not check that box. `003B-4B-3`, `003B-4B-4`, `MEDIA-NORMALIZE-003B-4`, and `TASK-005` stay `- [ ]`. The plan still says none of those cuts enable HTTP, a live provider, secrets, deploy, or homologation.

## Focused validation

`git diff 37a9bb32748d8409280ed3fd92225f244395f92e...15b9e5180014ce8649e02930e44ab3cf7309c679` is three paths, +192/−6:

- `backend/media-broker/src/dbus.rs`
- `sdd/STATUS.md`
- `sdd/wip/20261116-catalog-media-upload-and-variant-gallery/4-implementation/progress.md`

`git diff` on `3-tasks/plan.md` is empty. No workflow, Kotlin, Angular, migration, fixture, or `systemd.rs` change. `TransientUnits::derive` still takes only `job_id`, `mount_root`, `Principal`, and `ApprovedRuntime`. It has no property bag. `start()` still passes `properties(kind, spec)` to `StartTransientUnit` with an empty auxiliary array. Backend standards have no new Kotlin service, controller, port, or adapter in this diff.

Against the base, `worker_properties` is unchanged. The final vector still sets `ReadWritePaths` to `vec![workspace.clone()]`, where `workspace` is the derived `Where` of that spec. Keys stay `'static`. The function does not read a request frame. Commit `2eaaf5427f412a2336029693e80c955813705fc7` inserted `InaccessiblePaths` from `where_path().parent()` and the next commit removed that key, the helper, and its asserts. The reviewed tree has no `InaccessiblePaths`.

`two_jobs_do_not_share_read_write_paths` derives two specs from `JobId` bytes `0x44` and `0x55`, the same fixed mount root `/run/storecore_media/jobs`, and `Principal::create(2000, 2000)`. It requires the `Where` strings to differ, then checks the debug text of each `ReadWritePaths` value contains its own `Where` and not the peer. That substring is not the security evidence. The evidence is the PID 1 read below.

`pid1_isolates_worker_read_write_paths_per_job` requires `/proc/1/comm` to be `systemd` and the effective uid to be 0. It creates `/run/storecore_media/jobs`, connects to the system bus, and starts two `SELF_TEST` workers with `Principal::create(2102, 2102)` and the approved root-owned Java/jar runtime. Each start writes `request.bin` and `chown`s it to uid 2101 from that root harness, then requires the worker `Active`, the existing cgroup files, and `result.bin`. While both units are still up, `assert_worker_job_isolation` runs `systemctl show <unit> -p ReadWritePaths --value`, splits on whitespace, and requires the own `Where` token, rejects the peer token, and rejects any other token under `/run/storecore_media/jobs/`. It does not assert the token list equals exactly `[own]`. The derived vector is that single path. Both units are then stopped. The test does not open the peer directory from inside the worker.

`ProtectSystem=strict` remains the pre-existing literal. There is no `ProtectHome`, `PrivateTmp`, or `InaccessiblePaths` in the vector. Under that setting `/usr`, the boot loader directories, and `/etc` are read-only inside the unit mount namespace. `/run` stays writable, subject to DAC. Both tmpfs mounts use the pre-existing `mode=03770,uid=0,gid=<worker gid>`. These two workers share gid 2102, so the property check is not a hidden jobs root. `STATUS.md` says `InaccessiblePaths` stays out because it hides `WorkingDirectory` and PID 1 fails `CHDIR`. That matches the commit history and the final vector.

No HTTP route, controller, upload, or client. The word HTTP appears only in sentences that say this cut adds none. `Ready` appears only as still out of scope. The diff contains no password, token, API key, private key, `Authorization` header, `store_id`, `TenantFilter`, or deploy step. There is no `Delegate` property and no `CPUQuota`. The mount property list is unchanged.

`STATUS.md` says this document does not close `003B-4C`. It names the two-`JobId` `ReadWritePaths` attestation and the `CHDIR` reason for leaving `InaccessiblePaths` out. `003B-4B-3`, `003B-4B-4`, `003B-4C`, `003B-4`, TASK-005, and #7 stay open. No HTTP. `progress.md` records the same boundaries. The implementation banner does not say the worker process is unable to reach the peer `Where`.

The GitHub body still says this cut derives `InaccessiblePaths`. The tree and `STATUS.md` do not. That mismatch is outside the diff and does not put `InaccessiblePaths` into the unit.

Untracked local copies of reviews for 329, 334, 339, 341, 343, and 347 are outside this PR. They were not staged.

## Findings

No P0. No P1. No P2. No P3.

The net code change attests an existing one-path `ReadWritePaths` across two derived `JobId`s. PID 1 on this SHA started both `SELF_TEST` workers and the live property contained each worker's own `Where` and not the peer. The client request does not enter that list. The diff adds no HTTP, no secret, no `store_id`, no shared runtime, no deploy, and no `Ready`. `003B-4C` stays unchecked.

## Residuals

`CPUQuota` stays unset. Failure and restart attestation stay open. Substitution rejection stays open. UID A as a process stays open: the harness is still euid 0 and the uid 2101 ownership is a `chown` stamp on `request.bin`. `/run` stays writable under `ProtectSystem=strict`, and `InaccessiblePaths` is not set, so this cut is systemd property isolation and not a hidden jobs root. `003B-4B-3`, `003B-4B-4`, `003B-4C`, `003B-4`, TASK-005, and #7 stay open. No HTTP and no `Ready`. This file is not a GitHub approval and does not mark `003B-4C` closed.
