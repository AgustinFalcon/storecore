VERDICT: APPROVED

## Evidence identity

- provider: xAI
- model: Grok 4.7
- effort: medium
- substitute-for: gpt-5.6-sol-medium (authorized substitute; no quota)
- lane: security
- PR: 350 `feat(media): attest UID A process cannot traverse job tmpfs`
- head SHA: `3fe28fed07bdbd285341b4861c00eeff69c43152`
- base SHA: `217593d384571465a59b5950010df40735ab77c1` (`origin/master`; merge-base is this SHA)
- Verify: `44989524553` 7/7 success, none cancelled (`headSha` `3fe28fed07bdbd285341b4861c00eeff69c43152`)
- independent of the architecture lane; this file is not a GitHub approval and does not mark `003B-4C` closed

`gh pr view 350`: open, base `master` `217593d384571465a59b5950010df40735ab77c1`, head `feat/media-broker-4c-uid-a-20261122` `3fe28fed07bdbd285341b4861c00eeff69c43152`, two commits, three files, +125/−4. The body says PID 1 stays euid 0 and stamps `request.bin` uid 2101, a real `setpriv --reuid=2101` process cannot traverse or write the `03770` tmpfs, the productive handoff stays `SCM_RIGHTS`, and the cut does not close `003B-4C`, failure/restart, substitution rejection, `Ready`, or HTTP. `git rev-parse HEAD` matches that SHA. One Verify run exists for this SHA.

## Job conclusions

`gh run view 44989524553`: conclusion `success`, event `pull_request`, status `completed`, head `3fe28fed07bdbd285341b4861c00eeff69c43152`, name `Verify`. Seven jobs, each conclusion `success`, none `cancelled`, none a billing skip:

- repository-hygiene: success (`137107320993`)
- frontend: success (`137107358775`)
- backend: success (`137107358779`)
- unified-access-real-e2e: success (`137107358819`)
- media-broker: success (`137107358831`)
- productive-routes-real-e2e: success (`137107358834`)
- media-broker-pid1: success (`137107358865`)

`media-broker` runs `cargo +1.100.0 fmt --all -- --check`, `cargo +1.100.0 clippy --locked --all-targets -- -D warnings`, and `cargo +1.100.0 test --locked --all-targets`. The broker lib result was `ok. 60 passed; 0 failed; 5 ignored`. The new test is one of those five ignored tests. `media-broker-pid1` runs `sudo --preserve-env=... cargo +1.100.0 test --locked --all-targets -- --ignored --test-threads=1 pid1_`. `dbus::tests::pid1_uid_a_process_cannot_traverse_job_tmpfs` passed, together with the existing mount, `NORMALIZE`, `SELF_TEST`, and `ReadWritePaths` PID 1 tests. That result was `ok. 5 passed; 0 failed; 0 ignored; 0 measured; 60 filtered out`.

## Why this cut

`plan.md` is not in the diff. At this SHA `MEDIA-NORMALIZE-003B-4C` is still `- [ ]`: a real Linux harness with UID A and UID B, `SELF_TEST` and `NORMALIZE` inside the unit, and effective cgroup v2, mount, quota, job isolation, failure, and restart attestation. A host `setpriv` process that cannot search one job tmpfs does not check that box. `003B-4B-3`, `003B-4B-4`, `MEDIA-NORMALIZE-003B-4`, and `TASK-005` stay `- [ ]`. The plan still says none of those cuts enable HTTP, a live provider, secrets, deploy, or homologation.

## Focused validation

`git diff 217593d384571465a59b5950010df40735ab77c1...3fe28fed07bdbd285341b4861c00eeff69c43152` is three paths, +125/−4:

- `backend/media-broker/src/dbus.rs`
- `sdd/STATUS.md`
- `sdd/wip/20261116-catalog-media-upload-and-variant-gallery/4-implementation/progress.md`

`git diff` on `3-tasks/plan.md` is empty. No workflow, Kotlin, Angular, migration, fixture, or `systemd.rs` change. `TransientUnits::derive` still takes only `job_id`, `mount_root`, `Principal`, and `ApprovedRuntime`. `mount_properties` and `worker_properties` are unchanged. `start()` still passes that derived vector to `StartTransientUnit`. Backend standards have no new Kotlin service, controller, port, or adapter in this diff.

The mount options string is still `nosuid,nodev,noexec,size=48M,nr_inodes=1024,mode=03770,uid=0,gid=<worker gid>`. `DirectoryMode` is still `0o3770`. For this test the worker principal is `Principal::create(2102, 2102)`, so the tmpfs group is 2102. `write_backend_owned` still creates `request.bin` mode `0o640` and `chown`s it to uid 2101, gid 2102 from the euid 0 harness. Owner 2101 could read that file if the directory were searchable. Other has no permissions on `03770`, and uid 2101 is not gid 2102.

`pid1_uid_a_process_cannot_traverse_job_tmpfs` requires `/proc/1/comm` to be `systemd` and `geteuid()` to be 0. It creates `/run/storecore_media/jobs`, connects to the system bus, and starts only the derived mount for `JobId` bytes `0x66`. It does not start the worker unit. It writes and chowns `request.bin`, then `assert_uid_a_process`:

- `setpriv --reuid=2101 --regid=2101 --clear-groups -- id -u` must exit 0 and print `2101`.
- `setpriv` with the same identity running `head -c 1 <where>/request.bin` must fail, and stderr must contain `Permission denied`.
- `setpriv` with the same identity running `dd if=/dev/zero of=<where>/uid-a-write.bin bs=1 count=1` must fail, and the euid 0 harness must not see that path.

`dd` is one argv element (`of=<path>`), not a shell. The `Where` comes from `JobId` hex under `/run/storecore_media/jobs`, not from a client path. The write half does not require the string `Permission denied`. A successful create would still fail `probe.exists()` under euid 0. The traversal claim is the read: `request.bin` is mode `0o640` owned by 2101, so `Permission denied` is directory search, not the file mode. That denial also shows this process did not keep `CAP_DAC_OVERRIDE` or `CAP_DAC_READ_SEARCH`. The test checks `id -u` only; it does not print gid or `CapEff`. The flags and the denial are the evidence.

The process is a host child of the root harness. It is not `User=` inside the worker unit, and it is not in that unit's cgroup or mount namespace. The tmpfs is the systemd mount at `Where`, so the host path is the job tmpfs. The test does not pass an fd. Productive handoff is still `SCM_RIGHTS` outside this diff. Sibling PID 1 tests on this run still start `SELF_TEST` and `NORMALIZE` workers on their own derived mounts.

No HTTP route, controller, upload, or client. The word HTTP appears only in sentences that say this cut adds none. `Ready` appears only as still out of scope. The diff contains no password, token, API key, private key, `Authorization` header, `store_id`, `TenantFilter`, or deploy step. There is no new `Delegate` property and no `CPUQuota`. The worker property list is unchanged, including `NoNewPrivileges=true`, `ProtectSystem=strict`, `MemoryMax`, `MemorySwapMax=0`, and `TasksMax=64`.

`STATUS.md` says this cut does not close `003B-4C`. It names the euid 0 stamp, the `setpriv --reuid=2101` denial on the `03770` tmpfs, and `SCM_RIGHTS` as the productive handoff. `003B-4B-3`, `003B-4B-4`, `003B-4C`, `003B-4`, TASK-005, and #7 stay open. No HTTP. `progress.md` records the same boundaries and does not mark the plan task done.

Untracked local copies of reviews for 329, 334, 339, 341, 343, 347, and 349 are outside this PR. They were not staged.

## Findings

No P0. No P1. No P2. No P3.

The net code change attests one host process, uid 2101, gid 2101, supplementary groups cleared, against one derived job tmpfs. PID 1 on this SHA started that mount, stamped `request.bin` as uid 2101, and `head` on that path returned `Permission denied`. The same identity did not leave `uid-a-write.bin`. The client request does not choose the mount options. The diff adds no HTTP, no secret, no `store_id`, no shared runtime, no deploy, and no `Ready`. `003B-4C` stays unchecked.

## Residuals

Failure and restart attestation stay open. Substitution rejection stays open. `CPUQuota` stays unset. The harness remains euid 0 and still `chown`s the `request.bin` stamp; this cut does not make the broker itself uid 2101. The UID A process is not inside the worker unit. `003B-4B-3`, `003B-4B-4`, `003B-4C`, `003B-4`, TASK-005, and #7 stay open. No HTTP and no `Ready`. This file is not a GitHub approval and does not mark `003B-4C` closed.
