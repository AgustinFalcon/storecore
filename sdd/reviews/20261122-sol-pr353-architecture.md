VERDICT: APPROVED

## Evidence identity

- provider: xAI
- model: Grok 4.7
- effort: medium
- substitute-for: gpt-5.6-sol-medium
- lane: architecture
- PR: 353 OPEN `feat(media): attest worker UNKNOWN_EXIT then restart SELF_TEST` https://github.com/AgustinFalcon/storecore/pull/353
- branch: `feat/media-broker-4c-fail-restart-20261122`
- head SHA: `19801483f611ac737c275519766125a08655e97b`
- `git rev-parse HEAD`: `19801483f611ac737c275519766125a08655e97b` (matches GitHub `headRefOid`)
- base SHA / `origin/master` / three-dot merge-base: `5c4444c4e0bbb73db96a3c3b87b80766ce57e504`
- Verify on this head: run `44992591084` (`pull_request`, name `Verify`, status `completed`, conclusion `success`, `headSha` `19801483f611ac737c275519766125a08655e97b`, display title matches this PR). 7/7 success. None cancelled. One Verify run on this SHA. Billing was not an exception on this run.
- local cargo: not run. This host is Windows. The new PID 1 test is `#[ignore]` and runs in `media-broker-pid1`. Focused validation is that hosted Verify run. Its log records `pid1_worker_fails_without_request_then_restarts ... ok` and `test result: ok. 6 passed; 0 failed`.
- this file is not a GitHub approval and does not mark `003B-4C` closed

## Job conclusions (Verify 44992591084)

Seven jobs, all `completed` / `success` on `19801483f611ac737c275519766125a08655e97b`. None cancelled:

- repository-hygiene: success (`137116685340`)
- unified-access-real-e2e: success (`137116734117`)
- backend: success (`137116734120`)
- productive-routes-real-e2e: success (`137116734129`)
- frontend: success (`137116734130`)
- media-broker: success (`137116734222`)
- media-broker-pid1: success (`137116734278`)

## Diff reviewed

`git diff --stat origin/master...HEAD`: 3 files, 179 insertions, 8 deletions. Four commits on `5c4444c4e0bbb73db96a3c3b87b80766ce57e504`:

- `71a376e9f816f7634348b58bab27fb24365459a3` `feat(media): attest worker UNKNOWN_EXIT then restart SELF_TEST`
- `23f82c33cb44f7259162eac8c1c50794b4251ddc` `fix(media): reset-failed before restarting the same JobId worker`
- `4b95dca75fcd589e8b92264a68eecdadb6d3daa4` `fix(media): wait for worker MainPID exit before UNKNOWN_EXIT attest`
- `19801483f611ac737c275519766125a08655e97b` `fix(media): attest UNKNOWN_EXIT from journal after CollectMode`

The three-dot diff is `backend/media-broker/src/dbus.rs` (tests only), `sdd/STATUS.md`, and `sdd/wip/20261116-catalog-media-upload-and-variant-gallery/4-implementation/progress.md`. No production `worker_properties`, workflow, lockfile, HTTP route, secret, or `plan.md` change. `meta.md` is unchanged. The diff does not add leftover reviews for #329, #334, #339, #341, #343, #347, #349, or #352.

## Why this cut

`003B-4C` in `plan.md` on this SHA is still `[ ]` (line 89): harness Linux real con UID A/UID B, SELF_TEST/NORMALIZE dentro de la unidad, attestación efectiva de cgroup v2/mount/quota, aislamiento entre jobs, fallos y reinicios. The spec still requires substitution rejection and restart recovery on every durable transition before that gate can close, and it still says mocks or a direct jar run do not close it. `003B-4B-3`, `003B-4B-4`, `MEDIA-NORMALIZE-003B-4`, and `TASK-005` stay `[ ]`. `meta.md` estado remains `implementation_in_progress` and its gate paragraph still ends on PR #350.

This cut attests one PID 1 failure and one restart. The harness derives one `JobId` (`[0x77; 16]`), starts the worker with no `request.bin`, records `UNKNOWN_EXIT`, then places the existing `SELF_TEST` request and starts that same derived unit again. STATUS and progress say the cut leaves `003B-4C`, substitution rejection, `Ready`, and HTTP open. That scope matches the diff.

The head commit exists because a loaded failed transient unit does not keep `ExecMainStatus`. `worker_properties` already sets `CollectMode=inactive-or-failed`. On the previous head `4b95dca75fcd589e8b92264a68eecdadb6d3daa4`, Verify `44991800650` (`media-broker-pid1` `137114312391`) showed the journal line `Main process exited, code=exited, status=2/INVALIDARGUMENT` and `Failed with result 'exit-code'`, then `ActiveState=inactive`, `ExecMainCode=0`, `ExecMainStatus=0`, `MainPID=0`. Waiting for `ExecMainStatus=2` after `MainPID=0` observed the cleared property. This SHA reads the journal line that survives collection. That prior run is not a run on this SHA.

## Implementation

`pid1_worker_fails_without_request_then_restarts` is an ignored PID 1 test. It requires `/proc/1/comm` = `systemd` and euid 0, derives the mount and worker from `TransientUnits::derive`, and starts the mount before any request file exists. The worker entry point returns `UNKNOWN_EXIT` (`2`) when `readRequest` fails and does not write `result.bin`. `ExecStart` is `java -jar <jar>` with no application arguments, and `WorkingDirectory` is the job `Where`.

`wait_unknown_exit_journal` polls `ExecMainStatus`, `Result`, and `journalctl -b -u <unit> -n 80`. It returns only after the journal text contains `status=2`. The live `ExecMainStatus=2` or `Result=exit-code` signals are triggers for that journal assert. They are not a pass by themselves. The test then asserts `result.bin` is absent.

Restart uses the same `spec`. `ZbusSystemd::stop` already maps `NotLoaded` to `Inactive`. `reset_failed_unit` accepts a successful `systemctl reset-failed` or stderr that says the unit is not loaded or not found, which is the collected-unit case, and still fails on any other reset error. The harness then writes the golden `SELF_TEST` request as uid 2101, starts the same worker name, waits until `result.bin` is non-empty and owned by uid 2102, and waits until `ExecMainStatus=0` with `MainPID` empty or `0`. `RemainAfterExit=true` keeps a successful unit loaded, so that success property remains readable. The failure path and the success path therefore use different records, matching `CollectMode`.

`media-broker-pid1` on this SHA ran that test to `ok` inside `6 passed; 0 failed`.

## Ledger

- `sdd/STATUS.md` banner is `4C fallos y reinicio`. It says this cut does not close `003B-4C`. It names a missing `request.bin`, `UNKNOWN_EXIT` as `status=2` in the journal, collection of the failed unit, and a `SELF_TEST` restart of the same `JobId`. It still lacks `CPUQuota`, substitution rejection, and `Ready`. `003B-4B-3`, `003B-4B-4`, `003B-4C`, `003B-4`, TASK-005, and #7 stay open. No HTTP.
- The master paragraph still describes merged `5c4444c4e0bbb73db96a3c3b87b80766ce57e504` / PR #352 and leaves failure/restart on that merged tree unmarked. The implementation banner describes this unmerged candidate.
- `progress.md` records the same journal attest and the same `SELF_TEST` restart, and says `003B-4C` is not marked. No substitution rejection, `Ready`, or HTTP.
- `plan.md` is not in the diff. `MEDIA-NORMALIZE-003B-4C` remains `- [ ]`.

## Standards applied

`sdd/reviews/20261122-sol-pr350-architecture.md`: a PID 1 attest of one boundary stays inside the harness and leaves `003B-4C`, substitution rejection, `Ready`, and HTTP open. `sdd/reviews/20261121-sol-pr334-architecture.md`: the canonical plan checkbox stays `[ ]` until the gate is actually done. `sdd/reviews/20261121-sol-pr331-architecture.md`: `ReadWritePaths`, `ProtectSystem=strict`, and unit properties stay internal. This diff does not add a client-supplied property. Closed unit kinds stay `UnitKind` / `UnitState`. The journal line is the PID 1 record after `CollectMode` unloads the failed unit; the domain constant remains `MediaNormalizerWorkerMain.UNKNOWN_EXIT`. Android architecture standards and the Spring/Kotlin backend standards do not apply: the diff has no ViewModel, UiState, controller, or Kotlin file.

## Findings

No P0. No P1. No P2. No P3.

## Residuals (not findings)

- `003B-4B-3`, `003B-4B-4`, aggregate `003B-4B`, `003B-4C`, `003B-4`, TASK-005, and #7 stay open. No `Ready`, no catalog HTTP, no secrets, no deploy. Substitution rejection stays open. `CPUQuota` stays unset. One missing-request failure plus one `SELF_TEST` restart does not cover every durable transition in the spec.
- The GitHub PR body still says the harness attests `ExecMainStatus=2`. STATUS, progress, and the test attest `status=2` in the journal because collection clears `ExecMainStatus`.
- `journal.contains("status=2")` matches the observed `status=2/INVALIDARGUMENT` line and also a longer code whose text starts with `status=2`. This worker's missing-request path returns `UNKNOWN_EXIT` (`2`), and the PID 1 log on this SHA passed that test.
- `meta.md` on this SHA still ends at PR #350. It does not name head `19801483`. The implementation banner and progress carry this cut. That matches the earlier feature cuts, which updated `meta.md` when the reviews were persisted.
- The broker gains no `ResetFailedUnit` method and no `Restart=` policy. The harness stops the derived unit, clears a failed name when it is still loaded, and calls `StartTransientUnit` again for the same `JobId`.
- This review file is not a GitHub approval, a merge, or a `Ready` declaration, and it does not mark `003B-4C` closed.

## Conclusion

Head `19801483f611ac737c275519766125a08655e97b` attests a PID 1 worker that starts without `request.bin`, leaves `status=2` in the journal after `CollectMode=inactive-or-failed` unloads the unit, writes no `result.bin`, and then runs `SELF_TEST` on the same `JobId` through to `ExecMainStatus=0` with `MainPID=0`. Verify `44992591084` is success 7/7 on this SHA, none cancelled, and `media-broker-pid1` `137116734278` passed `pid1_worker_fails_without_request_then_restarts`. `003B-4C`, substitution rejection, `Ready`, and HTTP stay open. No P0–P3. `APPROVED` for the architecture lane. This file is not a GitHub approval and does not mark `003B-4C` closed.
