VERDICT: APPROVED

## Evidence identity

- provider: xAI
- model: Grok 4.7
- effort: medium
- substitute-for: gpt-5.6-sol-medium
- lane: architecture
- PR: 348 OPEN `feat(media): isolate worker ReadWritePaths per JobId` https://github.com/AgustinFalcon/storecore/pull/348
- branch: `feat/media-broker-4c-isolation-20261122`
- head SHA: `15b9e5180014ce8649e02930e44ab3cf7309c679`
- `git rev-parse HEAD`: `15b9e5180014ce8649e02930e44ab3cf7309c679` (matches GitHub `headRefOid`)
- base SHA / `origin/master` / three-dot merge-base: `37a9bb32748d8409280ed3fd92225f244395f92e` (`Merge pull request #347`)
- Verify on this head: run `44986626639` (`pull_request`, name `Verify`, status `completed`, conclusion `success`, `headSha` `15b9e5180014ce8649e02930e44ab3cf7309c679`, display title matches this PR). 7/7 success. None cancelled. Billing was not an exception on this run.
- local cargo: not run. This host is Windows. Focused validation is the hosted Verify run, including `media-broker` and `media-broker-pid1`, plus the three-dot diff.
- this file is not a GitHub approval and does not mark `003B-4C` closed

## Job conclusions (Verify 44986626639)

Seven jobs, all `completed` / `success` on `15b9e5180014ce8649e02930e44ab3cf7309c679`. None cancelled:

- repository-hygiene: success (`137098500206`)
- frontend: success (`137098549026`)
- backend: success (`137098549027`)
- productive-routes-real-e2e: success (`137098549029`)
- unified-access-real-e2e: success (`137098549049`)
- media-broker: success (`137098549060`)
- media-broker-pid1: success (`137098549082`)

`media-broker-pid1` is the job that runs the ignored harness, including `pid1_isolates_worker_read_write_paths_per_job`. `media-broker` runs the non-ignored `two_jobs_do_not_share_read_write_paths`.

## Why this cut

`003B-4C` in `plan.md` on this SHA is still `[ ]`: harness Linux real con UID A/UID B, SELF_TEST/NORMALIZE dentro de la unidad, attestación efectiva de cgroup v2/mount/quota, aislamiento entre jobs, fallos y reinicios. `003B-4B-3`, `003B-4B-4`, `MEDIA-NORMALIZE-003B-4`, and `TASK-005` stay `[ ]`. `meta.md` estado remains `implementation_in_progress`. The ledger names `Ready` and HTTP only as still out of this cut.

The in-repo claim is narrower than that gate. PID 1 starts two `SELF_TEST` workers and reads back each unit's `ReadWritePaths`. `worker_properties` already set that property to the job `Where` (PR #331). This cut attests two `JobId`s do not share it. The first commit added `InaccessiblePaths` of the jobs root. That hid `WorkingDirectory` and PID 1 failed `CHDIR`. Commit `03d6983c6de0e55778a4142cd64adafeafa34f99` dropped `InaccessiblePaths`, the same class of retreat as dropping `CPUQuota` on #346. Commit `15b9e5180014ce8649e02930e44ab3cf7309c679` replaces the clippy 1.100 `manual_contains` hit with `Vec::contains` on the split `systemctl` tokens. The tree has no `InaccessiblePaths`.

That scope matches the diff. It does not close `003B-4C`.

## Diff reviewed

`git diff --stat origin/master...HEAD`: 3 files, 192 insertions, 6 deletions. Three commits:

- `2eaaf5427f412a2336029693e80c955813705fc7` `feat(media): isolate worker ReadWritePaths per JobId`
- `03d6983c6de0e55778a4142cd64adafeafa34f99` `fix(media): drop InaccessiblePaths so PID 1 can chdir`
- `15b9e5180014ce8649e02930e44ab3cf7309c679` `fix(media): use Vec contains for job ReadWritePaths`

| File | change |
| --- | --- |
| `backend/media-broker/src/dbus.rs` | tests only (+173). No change to `worker_properties`, `mount_properties`, or `start_transient` |
| `sdd/STATUS.md` | implementation banner names the two-job `ReadWritePaths` readback and leaves `003B-4C` open |
| `sdd/wip/.../4-implementation/progress.md` | same claim; `InaccessiblePaths` recorded as out because PID 1 fails `CHDIR` |

`plan.md` and `meta.md` are not in the diff. No Kotlin, Angular, workflow, migration, fixture, lockfile, HTTP route, or secret. A search of `backend/media-broker` for `InaccessiblePaths`, `CPUQuota`, and `MemoryOOMGroup` returns no matches.

## Focused validation

- `gh pr view 348`: open, base `master` `37a9bb32748d8409280ed3fd92225f244395f92e`, head `15b9e5180014ce8649e02930e44ab3cf7309c679`, three commits, three files, +192/−6. The body says the client does not supply properties and that the cut does not close `003B-4C`, `CPUQuota`, a UID A process, failure/restart, `Ready`, or HTTP. Its summary still says this cut derives `InaccessiblePaths`. The second commit and STATUS/progress do not. The tree is the authority.
- `plan.md` on this SHA still has `- [ ]` on `003B-4B-3`, `003B-4B-4`, `MEDIA-NORMALIZE-003B-4C`, `MEDIA-NORMALIZE-004`, and `TASK-005` (line 16). This review does not check any of them.
- `sdd/STATUS.md` banner is `4C aislamiento entre jobs`. It says this cut does not close `003B-4C`. It says PID 1 starts two `JobId`s and attests each worker's `ReadWritePaths` is only its own `Where`. It says `InaccessiblePaths` of the jobs directory stays out because it hides `WorkingDirectory` and PID 1 fails `CHDIR`. It still lacks `CPUQuota`, a UID A process, failure/restart, and `Ready`. `003B-4B-3`, `003B-4B-4`, `003B-4C`, `003B-4`, TASK-005, and #7 siguen abiertos. Este corte no agrega HTTP.
- `progress.md` records the same derivation, the same `CHDIR` retreat, the two-job `SELF_TEST` readback, and that `003B-4C` is not marked. No `CPUQuota`, UID A process, failure/restart, `Ready`, or HTTP.
- `meta.md` is unchanged. Its latest broker sentence is still PR #346 (three ceilings, no isolation). That sentence is the master history, not a claim about this head.

## Implementation

`worker_properties` still takes only `&TransientUnits`. `ReadWritePaths` is `Value::from(vec![workspace.clone()])` where `workspace` is `spec.mount().where_path()`. `WorkingDirectory` is that same string. `ProtectSystem` remains the internal literal `strict`. There is no `InaccessiblePaths` key. `CPUQuota` is absent. The client has no property bag: `start_transient` still calls `properties(kind, spec)` only, and `properties` matches `UnitKind::Mount`, `UnitKind::Worker`, and `UnitKind::Unknown` (the last returns `UnexpectedKind`). `TransientUnits::derive` is still job id, jobs root, principal, and `ApprovedRuntime`.

`two_jobs_do_not_share_read_write_paths` derives two specs (`JobId` `[0x44; 16]` and `[0x55; 16]`, same jobs root, same principal) and checks the Debug form of each `ReadWritePaths` contains that job's `Where` and not the peer `Where`. That is the same Debug-contains style PR #331 already used for one job. The paths differ, so one `Where` is not a prefix of the other.

`pid1_isolates_worker_read_write_paths_per_job` is ignored unless PID 1 is systemd and the process is root. It starts two `SELF_TEST` workers through `start_transient(UnitKind::Mount)` and `start_transient(UnitKind::Worker)`, writes `request.bin` as uid 2101, and waits for `result.bin` owned by uid 2102. Both units stay up together. `assert_worker_job_isolation` reads `systemctl show <unit> -p ReadWritePaths --value`, splits on whitespace, and uses `Vec::contains`: own `Where` is present, the peer `Where` is absent, and no other token starts with `/run/storecore_media/jobs/` unless it is the own `Where`. Then both worker and mount are stopped. The helper does not call `attest` and does not probe a write into the peer directory.

Property names stay D-Bus and `systemctl` wire tokens inside the broker tests. `UnitKind` and `UnitState` stay the closed enums with `Unknown` at the wire edge. The new test matches `UnitState::Active`, `Inactive`, and `Failed`. No view compares a new status string. No second translator. No production path declares `Ready`. No `store_id` and no shared runtime.

The live check is token membership on the unit property PID 1 stored. It is not a proof that the worker process cannot write the sibling directory. `ProtectSystem=strict` does not cover `/run`, and this cut does not add another namespace or `InaccessiblePaths` to close that. STATUS claims the property readback, and the constructor is still a one-element vector of the own `Where`. The open `003B-4C` line is what still requires effective job isolation.

## Standards applied

`sdd/reviews/20261121-sol-pr331-architecture.md`: `ReadWritePaths` is the sole derived `Where`, `ProtectSystem=strict` is internal, and the client cannot supply either. `sdd/reviews/20261122-sol-pr346-architecture.md`: a quota cut that reads back three ceilings does not close `003B-4C`, and a GitHub summary that still names a dropped property is not a tree defect when STATUS/progress follow the tree. `sdd/reviews/20261121-sol-pr334-architecture.md`: the canonical plan checkbox stays `[ ]` until the gate is actually done. Closed unit kinds stay `UnitKind` / `UnitState` with `Unknown`. Android architecture standards do not apply: the diff has no ViewModel, UiState, or Kotlin architecture file.

## Findings

No P0. No P1. No P2. No P3.

## Residuals (not findings)

- `003B-4B-3`, `003B-4B-4`, aggregate `003B-4B`, `003B-4C`, `003B-4`, TASK-005, and #7 stay open. No `Ready`, no catalog HTTP, no secrets, no deploy.
- UID A process stays out. Both PID 1 workers are principal uid/gid 2102. The request file is chowned to uid 2101. There is still no backend process running as UID A. The spec says two processes with the same UID do not close `003B-4C`.
- Failure and restart attestation stays out. This harness stops the two units after a successful `SELF_TEST`. It does not kill, restart, or reconcile a failed transition.
- Substitution rejection stays out. Nothing in this diff rejects a replaced jar, path, or unit.
- `CPUQuota` stays out. It is not a plan checkbox. The tree has no `CPUQuota`.
- Filesystem isolation of `/run` stays out. `ProtectSystem=strict` does not cover `/run`. Dropping `InaccessiblePaths` restored `CHDIR` and left sibling directories on `/run` outside this attest. The PID 1 test reads `ReadWritePaths`; it does not attempt a write to the peer `Where`.
- The GitHub summary still says the cut derives `InaccessiblePaths`. Commit `03d6983` and STATUS/progress say that property stays out. A later persist should follow the tree. Same class as the #346 summary that still named `CPUQuota`.
- `meta.md` still ends on #346 and says that cut does not close isolation. It does not describe this head. The implementation banner in STATUS does.
- This review file is not a GitHub approval, a merge, or a `Ready` declaration, and it does not mark `003B-4C` closed.

## Conclusion

Head `15b9e5180014ce8649e02930e44ab3cf7309c679` attests two PID 1 `SELF_TEST` workers whose `ReadWritePaths` readback contains the own `Where` and not the peer `Where`. The property remains an internal one-element vector. `InaccessiblePaths` is not in the tree after the `CHDIR` failure. Clippy `manual_contains` is `Vec::contains`. Verify `44986626639` is success 7/7 on this SHA, none cancelled. `003B-4C`, `003B-4B-3`, `003B-4B-4`, `TASK-005`, `Ready`, and HTTP stay open. No P0–P3. `APPROVED` for the architecture lane. This file is not a GitHub approval and does not mark `003B-4C` closed.
