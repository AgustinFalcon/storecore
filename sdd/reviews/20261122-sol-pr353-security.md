VERDICT: APPROVED

## Evidence identity

- provider: xAI
- model: Grok 4.7
- effort: medium
- substitute-for: gpt-5.6-sol-medium (authorized substitute; no quota)
- lane: security
- PR: 353 `feat(media): attest worker UNKNOWN_EXIT then restart SELF_TEST`
- head SHA: `19801483f611ac737c275519766125a08655e97b`
- base SHA: `5c4444c4e0bbb73db96a3c3b87b80766ce57e504` (`origin/master`; merge-base is this SHA)
- Verify: `44992591084` 7/7 success, none cancelled (`headSha` `19801483f611ac737c275519766125a08655e97b`)
- independent of the architecture lane; this file is not a GitHub approval and does not mark `003B-4C` closed

`gh pr view 353`: open, base `master` `5c4444c4e0bbb73db96a3c3b87b80766ce57e504`, head `feat/media-broker-4c-fail-restart-20261122` `19801483f611ac737c275519766125a08655e97b`, four commits, three files, +179/−8. The body still says the harness attests `ExecMainStatus=2`. The tree on this SHA attests `UNKNOWN_EXIT` from the journal line `status=2`, because `CollectMode=inactive-or-failed` unloads the failed transient unit and a later `systemctl show` reports `ExecMainStatus=0` and `Result=success`. It restarts the same `JobId` with `SELF_TEST`. It does not close `003B-4C`, substitution rejection, `Ready`, or HTTP. `git rev-parse HEAD` matches that SHA. The earlier review of `4b95dca75fcd589e8b92264a68eecdadb6d3daa4` / Verify `44991800650` is superseded: that run's `media-broker-pid1` failed before the journal latch.

## Job conclusions

`gh run view 44992591084`: conclusion `success`, event `pull_request`, status `completed`, head `19801483f611ac737c275519766125a08655e97b`, name `Verify`. Seven jobs, each conclusion `success`, none `cancelled`, none a billing skip:

- repository-hygiene: success (`137116685340`)
- frontend: success (`137116734130`)
- backend: success (`137116734120`)
- unified-access-real-e2e: success (`137116734117`)
- media-broker: success (`137116734222`)
- productive-routes-real-e2e: success (`137116734129`)
- media-broker-pid1: success (`137116734278`)

`media-broker` runs `cargo +1.100.0 fmt --all -- --check`, `cargo +1.100.0 clippy --locked --all-targets -- -D warnings`, and `cargo +1.100.0 test --locked --all-targets`. The broker lib result was `ok. 60 passed; 0 failed; 6 ignored`. `pid1_worker_fails_without_request_then_restarts` is one of those six ignored tests.

`media-broker-pid1` runs `sudo --preserve-env=... cargo +1.100.0 test --locked --all-targets -- --ignored --test-threads=1 pid1_`. `dbus::tests::pid1_worker_fails_without_request_then_restarts` passed, together with the existing mount, `NORMALIZE`, `SELF_TEST`, `ReadWritePaths`, and UID A PID 1 tests. That result was `ok. 6 passed; 0 failed; 0 ignored; 0 measured; 60 filtered out`.

## Why this cut

`plan.md` is not in the diff. At this SHA `MEDIA-NORMALIZE-003B-4C` is still `- [ ]`: a real Linux harness with UID A and UID B, `SELF_TEST` and `NORMALIZE` inside the unit, and effective cgroup v2, mount, quota, job isolation, failure, and restart attestation. One missing-`request.bin` exit plus a same-`JobId` `SELF_TEST` restart does not check that box. `003B-4B-3`, `003B-4B-4`, `MEDIA-NORMALIZE-003B-4`, and `TASK-005` stay `- [ ]`. The plan still says none of those cuts enable HTTP, a live provider, secrets, deploy, or homologation.

## Focused validation

`git diff 5c4444c4e0bbb73db96a3c3b87b80766ce57e504...19801483f611ac737c275519766125a08655e97b` is three paths, +179/−8:

- `backend/media-broker/src/dbus.rs`
- `sdd/STATUS.md`
- `sdd/wip/20261116-catalog-media-upload-and-variant-gallery/4-implementation/progress.md`

`git diff` on `3-tasks/plan.md` is empty. No workflow, Kotlin, Angular, migration, fixture, daemon, or `systemd.rs` change. `worker_properties` is unchanged: `CollectMode=inactive-or-failed`, `Type=exec`, `ExecStart` is the approved `java -jar <jar>` argv, `User`/`Group` come from the derived principal, `NoNewPrivileges=true`, `ProtectSystem=strict`, `ReadWritePaths` is only the derived `Where`, `RemainAfterExit=true`, `MemoryMax`, `MemorySwapMax=0`, `TasksMax=64`. There is still no `CPUQuota`. `TransientUnits::derive` still takes only `job_id`, `mount_root`, `Principal`, and `ApprovedRuntime`.

The new test requires `/proc/1/comm` to be `systemd` and `geteuid()` to be 0. It uses `JobId` bytes `0x77`, so the worker unit name is the derived `storecore-media-77777777777777777777777777777777.service`. It starts that derived mount, then the worker, with no `request.bin`. `MediaNormalizerWorkerMain` returns `UNKNOWN_EXIT` (`2`) when `request.bin` cannot be read, and that return happens before `writeResult`. The JVM `main` calls `exitProcess` for a non-zero code. Systemd records that exit as `status=2/INVALIDARGUMENT` and then, because the unit is failed, `CollectMode=inactive-or-failed` unloads it. A later `systemctl show` of the unloaded unit is `ExecMainStatus=0` and `Result=success`. Those defaults are not the worker result, so the test does not assert `Result=exit-code` after collection.

`wait_unknown_exit_journal` polls `ExecMainStatus`, `Result`, and `journalctl -b -u <derived-name> -n 80`. It returns only when the journal text contains `status=2`. `ExecMainStatus=2` or `Result=exit-code` without that journal line fails the assertion instead of counting as `UNKNOWN_EXIT`. `journalctl` is argv, not a shell. A failed `journalctl` with empty stdout does not satisfy the needle. The unit name is the derived service for this `JobId`, current boot only.

On this run the test then asserts `result.bin` is absent, stops the worker, and calls `systemctl reset-failed` on that same derived name. `reset-failed` is test-only. Success is accepted, and so is stderr that says the unit is not loaded or not found, which is the collected-unit case. It writes the golden `SELF_TEST` `request.bin` owned by uid 2101, starts the same derived spec, waits until `result.bin` is non-empty and owned by uid 2102, requires the start result `Active`, and only then accepts `ExecMainStatus=0` with `MainPID` empty or `0`. `RemainAfterExit=true` keeps a zero exit loaded, so that success read is the live unit, not the unloaded failure record. PID 1 reported `pid1_worker_fails_without_request_then_restarts ... ok`, so the absence check and the restart both ran.

The journal needle is the substring `status=2`. That matches systemd's `status=2/INVALIDARGUMENT`. It would also match a decimal status whose text begins with 2, such as `status=203/EXEC`. This pass restarted the same derived `ExecStart` and wrote a worker-owned `result.bin`. An exec or user failure of that same unit would not have produced that restart. The worker's own non-zero codes are 2 and 3; 3 does not contain `status=2`.

No HTTP route, controller, upload, or client. The word HTTP appears only in sentences that say this cut adds none. `Ready` appears only as still out of scope. The diff contains no password, token, API key, private key, `Authorization` header, `store_id`, `TenantFilter`, or deploy step. `media-broker` sources still have no `store_id` and no `CPUQuota`. Substitution of the approved jar is not exercised. The mount options and `ReadWritePaths` derivation are unchanged.

`STATUS.md` says this cut does not close `003B-4C`. It names the missing `request.bin`, the journal `status=2`, collection of the failed unit, and the same-`JobId` `SELF_TEST` restart. `003B-4B-3`, `003B-4B-4`, `003B-4C`, `003B-4`, TASK-005, and #7 stay open. No HTTP. `progress.md` records the same boundaries and does not mark the plan task done.

Untracked local copies of reviews for 329, 334, 339, 341, 343, 347, 349, and 352 are outside this PR. They were not staged.

## Findings

No P0. No P1. No P2. No P3.

The failed worker on this SHA left no `result.bin`, and the journal recorded `status=2`, which is `UNKNOWN_EXIT`. The same derived `JobId` then ran `SELF_TEST` to `ExecMainStatus=0` with `result.bin` owned by the worker uid. The diff adds no HTTP, no secret, no `store_id`, no shared runtime, no deploy, and no `Ready`. `003B-4C` stays unchecked.

## Residuals

Substitution rejection stays open. `CPUQuota` stays unset. The broker daemon still has no restart policy; `reset-failed` exists only in this test. `003B-4B-3`, `003B-4B-4`, `003B-4C`, `003B-4`, TASK-005, and #7 stay open. No HTTP and no `Ready`. This file is not a GitHub approval and does not mark `003B-4C` closed.
