VERDICT: APPROVED

## Evidence identity

- provider: xAI
- model: Grok 4.7
- effort: medium
- substitute-for: gpt-5.6-sol-medium (authorized substitute; no quota)
- lane: security
- PR: 355 `feat(media): reject substituted approved jar before PID 1 start`
- branch: `feat/media-broker-4c-substitution-20261122`
- head SHA: `73192046a927a34a7008f824d40c3c9e260a74a3`
- base SHA: `17c6544e36ce03a00186dd2cb4bc07606aa74a2d` (`origin/master`; `gh pr view 355` `baseRefOid` and `headRefOid` match these SHAs)
- Verify: run `44994529755`, event `pull_request`, name `Verify`, status `completed`, conclusion `success`, `headSha` `73192046a927a34a7008f824d40c3c9e260a74a3`. 7/7 success, none cancelled, none a billing skip. `gh run list --commit 73192046a927a34a7008f824d40c3c9e260a74a3` shows one run, this Verify.
- independent of the architecture lane; this file is not a GitHub approval and does not mark `003B-4C` closed

`gh pr view 355`: open, base `master` `17c6544e36ce03a00186dd2cb4bc07606aa74a2d`, head `feat/media-broker-4c-substitution-20261122` `73192046a927a34a7008f824d40c3c9e260a74a3`, one commit, three files. The body says the PID 1 harness copies the approved runtime, changes the jar, attests `RuntimeError::DigestMismatch`, does not start the substituted worker, and that the productive daemon already calls `confirm()` before `StartTransientUnit`. It does not close `003B-4C`, `Ready`, or HTTP. `git rev-parse HEAD` is `73192046a927a34a7008f824d40c3c9e260a74a3`. `git rev-parse origin/master` is `17c6544e36ce03a00186dd2cb4bc07606aa74a2d`. This Windows host did not run a local cargo PID 1 harness.

## Job conclusions

`gh run view 44994529755 --json status,conclusion,event,headSha,name,jobs`: conclusion `success`, event `pull_request`, status `completed`, head `73192046a927a34a7008f824d40c3c9e260a74a3`, name `Verify`. Seven jobs, each status `completed` and conclusion `success`, none `cancelled`:

- repository-hygiene: success (`137122585208`)
- media-broker-pid1: success (`137122636284`)
- media-broker: success (`137122636292`)
- frontend: success (`137122636346`)
- unified-access-real-e2e: success (`137122636356`)
- backend: success (`137122636359`)
- productive-routes-real-e2e: success (`137122636383`)

Hosted `media-broker-pid1` is the focused validation. Its log for "Start derived tmpfs and worker units through PID 1" records `dbus::tests::pid1_rejects_substituted_runtime_jar ... ok` and `test result: ok. 7 passed; 0 failed; 0 ignored; 0 measured; 60 filtered out`. The invocation filter is `--ignored --test-threads=1 pid1_`. The other six PID 1 tests on that run also passed: mount, `NORMALIZE`, `SELF_TEST`, `ReadWritePaths`, UID A traversal, and missing-`request.bin` then restart.

## Why this cut

`plan.md` is not in the diff. At this SHA `MEDIA-NORMALIZE-003B-4C` is still `- [ ]`. Spec `003B-4C` still requires a real Linux UID A/UID B harness covering `SELF_TEST`/`NORMALIZE`, job isolation, per-job and global quota, terminals without ACK, FD/mmap kept after the seal, OOM/timeout, cgroup termination, substitution rejection, and restart on each durable transition. ADR-001 still requires that harness to show timeout/OOM/cgroup kill and rejection of a substituted or false output. This commit attests one substitution case. It does not check the `003B-4C` box. `003B-4B-3`, `003B-4B-4`, the aggregate `003B-4B`, `MEDIA-NORMALIZE-003B-4`, and TASK-005 stay open. `meta.md` still records PR #353 as not closing substitution rejection; it does not claim this PR closes the gate.

`STATUS.md` says this cut does not close `003B-4C`. The harness copies the approved runtime, alters the jar, and attests `DigestMismatch` from `confirm()` without starting the worker. `CPUQuota` and `Ready` stay absent. `003B-4B-3`, `003B-4B-4`, `003B-4C`, `003B-4`, TASK-005, and #7 stay open. No HTTP. The master banner under it still describes `17c6544e36ce03a00186dd2cb4bc07606aa74a2d` as without substitution rejection. `progress.md` records the same boundaries and does not mark the plan task done.

Prior security reviews `sdd/reviews/20261122-sol-pr353-security.md` and `sdd/reviews/20261122-sol-pr350-security.md` left substitution rejection open, left `CPUQuota` unset, and did not treat a single PID 1 slice as `003B-4C`. This lane applies that boundary.

## Focused validation

`git diff origin/master...HEAD` (`17c6544e36ce03a00186dd2cb4bc07606aa74a2d...73192046a927a34a7008f824d40c3c9e260a74a3`) is three paths, +102/−10:

- `backend/media-broker/src/dbus.rs`
- `sdd/STATUS.md`
- `sdd/wip/20261116-catalog-media-upload-and-variant-gallery/4-implementation/progress.md`

`3-tasks/plan.md` is not in the diff. No workflow, Kotlin, Angular, migration, fixture, `daemon.rs`, `runtime.rs`, or `systemd.rs` change. `worker_properties` is unchanged: `ExecStart` is still the derived `java -jar <jar>` argv, `User`/`Group` come from the derived principal, `NoNewPrivileges=true`, `ProtectSystem=strict`, `ReadWritePaths` is only the derived `Where`, `MemoryMax`, `MemorySwapMax=0`, `TasksMax=64`. There is still no `CPUQuota`. `mount_properties` still has no `ExecStart`. `TransientUnits::derive` still takes only `job_id`, `mount_root`, `Principal`, and `ApprovedRuntime`.

`pid1_rejects_substituted_runtime_jar` is `#[ignore]` and requires `/proc/1/comm` to be `systemd` and `geteuid()` to be 0. `copied_pid1_runtime` copies `STORECORE_MEDIA_JAVA` and `STORECORE_MEDIA_JAR` into a new temp directory, then sets the copy to mode `0555` for java and `0444` for the jar and `chown`s both to uid 0, gid 0. It hashes those copied bytes and `ApprovedRuntime::open`s that pair with expected owner 0. The first `runtime.confirm()` must succeed while the copy is unmodified.

The job is `JobId::create([0x88; 16])`, distinct from the sibling PID 1 ids `0x11`, `0x22`, `0x33`, `0x44`, `0x55`, `0x66`, `0x77`, and `0xab`. The derived unit prefix remains `storecore-media-` plus the 32 hex digits of that id. The test starts only `UnitKind::Mount` and requires `UnitState::Active`. It then writes the existing `SELF_TEST` `request.bin` through `write_self_test_request` (uid 2101, worker gid 2102). After that stamp, `fs::write` replaces the copied jar bytes with `substituted-storecore-jar\n`. `std::fs::write` opens the existing path with write, create, and truncate, so the inode stays and the mode is not rewritten. The assertion is `Err(RuntimeError::DigestMismatch)`, not `Permissions` and not `IdentityDrift`. `approve()` checks mode `0444` before the SHA-256 compare, so a mode change would have failed the test as `Permissions`. `confirm()` reopens both paths with `NOFOLLOW`, re-hashes the fd, and returns `DigestMismatch` from that compare when the jar bytes differ.

The test never calls `start_transient(UnitKind::Worker)`. It asserts `result.bin` is absent, then stops only the mount and accepts `Inactive` or `Failed`. Absence of `result.bin` is consistent with no worker start. It does not by itself prove PID 1 refused an `ExecStart`; the harness never sends the worker unit. The substituted bytes are not placed on `ExecStart`.

`ApprovedRuntime::confirm` in `runtime.rs` is unchanged: it re-runs `approve()` for java and jar against the digests stored at `open`. `BrokerDaemon::start` in `daemon.rs` is unchanged and still calls `self.runtime.confirm()` before `TransientUnits::derive`, before the `Starting` transition, and before either `start_kind` / `StartTransientUnit`. A `DigestMismatch` returns `DaemonError::Runtime` with the job still `InputSealed`. The pre-existing `daemon::tests::start_rejects_replaced_runtime_before_starting` locks that function against `FakeSystemd` by unlinking and replacing the java file. `runtime::tests::confirm_rejects_replaced_file_at_the_same_path` also unlinks and rewrites a fixture. Neither test is this PID 1 attest. The PID 1 evidence is `pid1_rejects_substituted_runtime_jar` on run `44994529755`.

No HTTP route, controller, upload, or client. The word HTTP appears only in sentences that say this cut adds none. `Ready` appears only as still out of scope. The diff contains no password, token, API key, private key, `Authorization` header, `store_id`, `TenantFilter`, or deploy step. `media-broker` sources still have no `store_id` and no `CPUQuota`. The copy is a private root-owned inode; the test does not mutate the shared `STORECORE_MEDIA_JAR` used by the other PID 1 tests.

`git status --short` before this review file was empty. No untracked persist-review copies are in the three-dot diff.

## Findings

No P0. No P1. No P2. No P3.

The PID 1 harness on this SHA copied an approved java/jar pair to mode `0555`/`0444` and uid 0, confirmed it, started the derived mount for `JobId` `[0x88; 16]`, wrote `SELF_TEST` `request.bin`, overwrote the copied jar, and got `RuntimeError::DigestMismatch` from `confirm()`. It did not start the worker unit, and `result.bin` was absent. Productive `BrokerDaemon::start` already returns on `confirm()` before `StartTransientUnit`. The diff adds no HTTP, no secret, no `store_id`, no shared runtime, no deploy, and no `Ready`. `003B-4C` stays unchecked.

## Residuals

OOM, timeout, and cgroup termination are not attested. Substituting a copied jar does not cover them. `CPUQuota` stays unset. `runtime::tests::confirm_rejects_replaced_file_at_the_same_path` and the `FakeSystemd` daemon test are not the `003B-4C` PID 1 attest. The harness calls `ApprovedRuntime::confirm` directly; it does not drive `BrokerDaemon::start` on the system bus. `confirm()` then path-based `ExecStart` remains the productive order; this cut does not pass an approved fd to PID 1. `003B-4B-3`, `003B-4B-4`, `003B-4C`, `003B-4`, TASK-005, and #7 stay open. No HTTP and no `Ready`. This file is not a GitHub approval and does not mark `003B-4C` closed.
