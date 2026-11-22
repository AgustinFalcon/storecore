VERDICT: APPROVED

## Evidence identity

- provider: xAI
- model: Grok 4.7
- effort: medium
- substitute-for: gpt-5.6-sol-medium
- lane: architecture
- PR: 342 `feat(media): attest PID 1 worker cgroup v2 memory controller`
- head SHA: `de9f964a6fc0a9aaa1d0b54d67419903dbf0c178`
- base SHA: `4c430fcd2a3bd25b1deddf23e6f85619392e9203` (`origin/master`, merge of #341)
- Verify: `44975913833` 7/7 success, none cancelled (`headSha` `de9f964a6fc0a9aaa1d0b54d67419903dbf0c178`)
- this file is not a GitHub approval and does not mark `003B-4C` closed

## Job conclusions

`gh run view 44975913833`: conclusion `success`, event `pull_request`, status `completed`, head `de9f964a6fc0a9aaa1d0b54d67419903dbf0c178`. Seven jobs, each conclusion `success`, none `cancelled`:

- repository-hygiene: success (`137065671970`)
- media-broker-pid1: success (`137065716991`)
- media-broker: success (`137065717007`)
- backend: success (`137065717008`)
- productive-routes-real-e2e: success (`137065717010`)
- frontend: success (`137065717024`)
- unified-access-real-e2e: success (`137065717059`)

`media-broker-pid1` is the job that executes the ignored `pid1_` harness. Both call sites of the new attest sit in `pid1_starts_worker_self_test_on_derived_tmpfs` and `pid1_starts_worker_normalize_on_derived_tmpfs`. This workflow file is not in the diff, so the existing `pid1_` filter is what ran the attest. A green `media-broker-pid1` on this head means both sites read a live cgroup and still observed `UnitState::Active`.

## Why this cut

`003B-4C` stays `[ ]`. The technical spec still requires a real Linux harness with UID A and UID B, both `SELF_TEST` and `NORMALIZE` inside the unit, effective cgroup v2 including real quota and mount, job isolation, cgroup termination, substitution rejection, and restart recovery. Reading one controller file does not close that gate.

This cut only attests the worker `.service` cgroup that systemd reports after `start_transient` returns. It reads `ControlGroup`, then `cgroup.controllers` for the `memory` token and a `u64` `memory.current`. It does not set `MemoryMax` or any other quota, does not isolate jobs, and does not run a backend process as UID A. There is no `Ready` and no catalog HTTP.

## Focused validation

- `git diff --name-only origin/master...HEAD` (`4c430fc...de9f964`) is three paths, +50/−5: `backend/media-broker/src/dbus.rs`, `sdd/STATUS.md`, and WIP `progress.md`. No workflow, Kotlin, Angular, migration, or fixture file. `plan.md` is not in the diff.
- On this SHA `MEDIA-NORMALIZE-003B-4C` is still `- [ ]` (UID A/UID B, SELF_TEST/NORMALIZE, cgroup v2/mount/quota, job isolation, failures and restarts). `003B-4B-3`, `003B-4B-4`, `MEDIA-NORMALIZE-003B-4`, and `TASK-005` stay `- [ ]`. This review does not check any of them.
- `sdd/STATUS.md` banner is `4C atesta cgroup v2 del worker`. It says this cut does not close `003B-4C`, names the read as `cgroup.controllers` memory and `memory.current`, and says there is no quota, no job isolation, and no UID A process. `003B-4B-3`, `003B-4B-4`, `003B-4C`, `003B-4`, TASK-005, and #7 siguen abiertos. Este corte no agrega HTTP.
- The historical `Master vigente` paragraph for merge `b8d3c62` still says that merged cut had no cgroup. That sentence describes PR #340 on master, not this candidate.
- `progress.md` records the PID 1 cgroup read and says `003B-4C` is not marked. No effective quota, isolation, UID A process, `Ready`, or HTTP.
- `worker_properties` is unchanged. Its keys are still Description, CollectMode, Requires, After, Type `exec`, ExecStart, User, Group, WorkingDirectory, NoNewPrivileges, ProtectSystem `strict`, ReadWritePaths, Environment, RemainAfterExit, StandardOutput, and StandardError. There is no `MemoryMax`, `MemoryHigh`, `MemoryAccounting`, `CPUQuota`, `TasksMax`, or `Slice`.
- The diff contains no `Ready` and no catalog HTTP route. `ArtifactReady` in the broker protocol is pre-existing and outside this diff.

## Implementation

The new function `assert_worker_cgroup_v2` lives in `mod tests`. Production `start_transient` and `worker_properties` do not gain a cgroup property. The client still cannot supply `ExecStart`, `Where`, or unit properties.

Both ignored PID 1 tests call it in the same place: immediately after `start_transient(UnitKind::Worker)` returns, and before `wait_for_worker_result`. `start_transient` has already produced the `Result` later asserted as `UnitState::Active`. `RemainAfterExit` keeps that unit Active after the worker process exits, and the second commit records that the service cgroup is gone by the time `result.bin` appears. Sampling `ControlGroup` before the wait is what makes the read observe the live cgroup. The attest does not hardcode `system.slice`; it uses the path systemd reports. With no `Slice=` in `worker_properties`, the system manager's default slice for that transient service is `system.slice`, which is what `progress.md` names.

The read is `systemctl show <worker-unit> -p ControlGroup --value`, then `/sys/fs/cgroup` joined with that relative path. Empty stdout fails. The directory must exist. `cgroup.controllers` must contain the whitespace-delimited token `memory`. `memory.current` must parse as `u64`. The test does not write `memory.max`, does not pass a quota property, and does not treat a parsed current value as a limit. That matches the claim "no fija cuota": the absence is the unchanged property list, not a new `memory.max` assertion.

No new domain state is introduced. The controller name is a kernel file token inside the harness. Broker wire states stay on the existing single translator. No `store_id` and no shared runtime.

## Findings

No P0. No P1. No P2. No P3.

## Residuals

`003B-4B-3`, `003B-4B-4`, `003B-4C`, `003B-4`, TASK-005, and #7 stay open. `plan.md` still requires, before `003B-4C` can close, effective cgroup v2 quota and mount, job isolation, failure and restart attestation, and a backend process running as UID A. This harness does not read `memory.max`, does not pin `cgroup.procs` to the worker PID, and does not attest a second job's cgroup. The root harness still `chown`s UID A inputs. `Ready` and HTTP stay out. This file is not a GitHub approval and does not mark `003B-4C` closed.
