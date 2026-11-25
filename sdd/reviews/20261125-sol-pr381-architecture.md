VERDICT: APPROVED

## Evidence identity

- provider: xAI
- model: Grok 4.7
- effort: medium
- substitute-for: gpt-5.6-sol-medium (no quota)
- lane: architecture
- independent of the security lane
- PR: 381 OPEN `feat(media): attest PID 1 LimitCORE on the worker unit` https://github.com/AgustinFalcon/storecore/pull/381
- branch: `feat/media-broker-4c-limit-core-20261125` (worktree left on this branch)
- head SHA: `6e4d1c9709f4259575bd1c150d9e5a5d3bd3613b`
- `git rev-parse HEAD`: `6e4d1c9709f4259575bd1c150d9e5a5d3bd3613b` (matches GitHub `headRefOid`)
- remote feature tip: `git ls-remote origin refs/heads/feat/media-broker-4c-limit-core-20261125` and `git rev-parse FETCH_HEAD` after fetching that branch are the same SHA. This clone has no local remote-tracking ref named `origin/feat/media-broker-4c-limit-core-20261125`.
- GitHub `baseRefOid` / `origin/master` / `git merge-base origin/master HEAD`: `c616dffdf75d55e206f696c5c8c5b65fefd122c3` (`docs: persist PR 379 dual Grok reviews without closing 4C (#380)`)
- GitHub mergeability: `MERGEABLE`, `mergeStateStatus` `CLEAN`
- diff identity: `git diff --name-status origin/master...HEAD` is three modifications; `git diff --stat` is 3 files, +83 / −8; `git diff --check` exit 0 (no whitespace errors). Two commits on the merge-base: `3f0e8d87997400320efa535bd9e14772ba0cf20b` `feat(media): attest PID 1 LimitCORE on the worker unit` and `6e4d1c9709f4259575bd1c150d9e5a5d3bd3613b` `fix(media): use WORKER_LIMIT_CORE in the derived-property assert`. The second commit only changes the unit assertion from `contains('0')` to `contains` of `WORKER_LIMIT_CORE`'s decimal form. Untracked persist-of-persist files (`sdd/reviews/20261124-sol-pr365-*.md`, `sdd/reviews/20261124-sol-pr373-*.md`, `sdd/reviews/20261125-sol-pr376-*.md`, `sdd/reviews/20261125-sol-pr378-*.md`, `sdd/reviews/20261125-sol-pr380-*.md`) are outside this three-dot diff and are not part of this review.
- Verify on this head: run `45556235165` (`pull_request`, name `Verify`, status `completed`, conclusion `success`, `headSha` `6e4d1c9709f4259575bd1c150d9e5a5d3bd3613b`). 7/7 success. None cancelled. One Verify run on this SHA. Billing was not an exception on this run. `gh pr checks 381` reports the same seven jobs `pass`.
- local cargo: not run. This host is Windows. The new PID 1 test is `#[ignore]` and runs in `media-broker-pid1`. Focused validation is that hosted Verify run. Its log records `dbus::tests::pid1_worker_limit_core ... ok` and `test result: ok. 14 passed; 0 failed; 0 ignored; 0 measured; 62 filtered out`.
- this file is not a GitHub approval and does not mark `003B-4C` closed

## Job conclusions (Verify 45556235165)

Seven jobs, all `completed` / `success` on `6e4d1c9709f4259575bd1c150d9e5a5d3bd3613b`. None cancelled:

- repository-hygiene: success (`139008845009`)
- backend: success (`139008921008`)
- media-broker: success (`139008921026`)
- media-broker-pid1: success (`139008921069`)
- frontend: success (`139008921097`)
- productive-routes-real-e2e: success (`139008921004`)
- unified-access-real-e2e: success (`139008921077`)

`media-broker-pid1` `139008921069` is the job that executed `pid1_worker_limit_core`. The dbus binary finished `14 passed; 0 failed`. The other crate result lines in that step are `0 passed`.

## Diff reviewed

`git diff origin/master...HEAD`: 3 files, +83 / −8. Two commits on `c616dffdf75d55e206f696c5c8c5b65fefd122c3`:

- `3f0e8d87997400320efa535bd9e14772ba0cf20b` `feat(media): attest PID 1 LimitCORE on the worker unit`
- `6e4d1c9709f4259575bd1c150d9e5a5d3bd3613b` `fix(media): use WORKER_LIMIT_CORE in the derived-property assert`

| File | change |
| --- | --- |
| `backend/media-broker/src/dbus.rs` | `worker_properties` gains internal `LimitCORE` `0`. `RestrictAddressFamilies` and `CPUQuota` stay absent. The existing worker-property unit test also locks the new key and those absences. Ignored PID 1 test starts the derived worker and reads `LimitCORE` back. The second commit only points that unit assertion at `WORKER_LIMIT_CORE` |
| `sdd/STATUS.md` | implementation banner names the derived `LimitCORE=0` readback, leaves `RestrictAddressFamilies` and `CPUQuota` out, and leaves `003B-4C` open |
| `sdd/wip/.../4-implementation/progress.md` | same claim; `003B-4C` is not marked |

`plan.md`, `spec.md`, `meta.md`, and ADR-001 are not in the diff. No Kotlin, Angular, workflow, migration, fixture, lockfile, HTTP route, or secret. `CPUQuota` does not appear as a worker property. `RestrictAddressFamilies` appears only as a negative key assertion and in the STATUS/progress retreat.

## Why this cut

`003B-4C` in `plan.md` on this SHA is still `[ ]` (line 89): harness Linux real con UID A/UID B, SELF_TEST/NORMALIZE dentro de la unidad, attestación efectiva de cgroup v2/mount/quota, aislamiento entre jobs, fallos y reinicios. The spec paragraph still requires SELF_TEST/NORMALIZE, isolation, per-job and global quota, terminals without ACK, FD/mmap after seal, OOM/timeout, cgroup termination, substitution rejection, and restart on every durable transition before that gate can close. ADR-001 still requires, before `Ready`, namespaces, no `AF_INET`/`AF_INET6`, `CPUQuota`, and RLIMIT, and still says only `4A+4B+4C` can complete `003B-4`. `003B-4B-3`, `003B-4B-4`, `MEDIA-NORMALIZE-003B-4`, `MEDIA-NORMALIZE-004`, and `TASK-005` stay `[ ]`.

STATUS says this cut does not close `003B-4C`. The harness derives `LimitCORE=0` and PID 1 reads that property. `RestrictAddressFamilies` stays out after the `ENXIO` retreat recorded on the #374 tree. `CPUQuota` stays out. Socket family, global quota, terminals without ACK, FD/mmap after seal, restart on every durable transition, remaining RLIMIT, and `Ready` stay absent. No HTTP.

The GitHub title and body match the tree. The body says the client does not supply `LimitCORE`, that PID 1 reads the effective property, that `RestrictAddressFamilies` and `CPUQuota` stay unset, and that `003B-4C` stays open. The PR test plan leaves Verify, the dual reviews, and the `003B-4C` checkbox unchecked. This review does not check them off.

## Implementation

`WORKER_LIMIT_CORE` is `0`. `WORKER_LIMIT_NOFILE` is already `1024`. `WORKER_LIMIT_NPROC` and `WORKER_TASKS_MAX` are already `64`. They are separate crate constants. `LimitCORE` is not a parameter. `worker_properties` is the only worker property bag, and `properties(UnitKind::Worker)` is what `start_transient` sends to `StartTransientUnit`. The mount bag is unchanged. The vector has no `RestrictAddressFamilies` and no `CPUQuota`. `TasksMax` stays on the worker bag. `TransientUnits::derive` still takes only `JobId`, the jobs root, `Principal`, and `&ApprovedRuntime`. Its contract still says callers cannot supply unit names, `Where`, or `ExecStart`. The client does not supply the core-dump ceiling.

`derived_worker_oom_kills_the_cgroup` asserts `LimitCORE` is present and that its debug form contains the decimal form of `WORKER_LIMIT_CORE`, keeps the `LimitNOFILE` `1024` and `LimitNPROC` `64` assertions and the `PrivateNetwork` assertion, and asserts `RestrictAddressFamilies` and `CPUQuota` are absent. `UnitKind`, `UnitState`, and `JobState` stay the closed unit and job types. `LimitCORE` is an internal property integer, not a new string state in a view.

`pid1_worker_limit_core` is ignored unless `/proc/1/comm` is `systemd` and euid is 0. It derives job `[0xff; 16]` and principal `2102:2102`, starts the mount, writes the existing `SELF_TEST` `request.bin`, and starts the worker through PID 1. A rejected `StartTransientUnit` fails the harness. `systemctl show -p LimitCORE --value` must be `0` or start with `0:`. Stop of the worker and the mount accepts `Inactive` or `Failed`. The hosted job reached `ok` (`14 passed; 0 failed`).

That property is one RLIMIT (`RLIMIT_CORE`) on the worker service. PID 1 accepted the integer. `LimitNOFILE` and `LimitNPROC` remain the RLIMIT settings already on the unit. `LimitCORE` does not replace them. `RestrictAddressFamilies` is still unset, so the address-family list is not the attested cut. `CPUQuota` is still unset.

## Ledger

- `sdd/STATUS.md` banner is `4C RLIMIT CORE del worker`. It says this cut does not close `003B-4C`. It names the PID 1 read of derived `LimitCORE=0`. `RestrictAddressFamilies` and `CPUQuota` stay out. Socket family, global quota, terminals without ACK, FD/mmap after seal, restart on every durable transition, remaining RLIMIT, and `Ready` stay absent. `003B-4B-3`, `003B-4B-4`, `003B-4C`, `003B-4`, TASK-005, and #7 stay open. No media HTTP.
- The master paragraph under that banner still describes merged `6704455f65e4ded6034b0ed440963a01de612146` / PR #379. This diff does not rewrite it. Live `origin/master` `c616dff` is the persist of those #379 reviews and is the merge-base of this PR. On that merged tree, `003B-4C` is still unmarked. The implementation banner describes this unmerged candidate.
- `progress.md` records the same `LimitCORE=0` readback and that `003B-4C` is not marked. `RestrictAddressFamilies` and `CPUQuota` stay out. No socket family, global quota, `Ready`, or HTTP.
- `plan.md` is not in the diff. `MEDIA-NORMALIZE-003B-4C` remains `- [ ]` (line 89). `003B-4B-3`, `003B-4B-4`, and `TASK-005` remain `- [ ]`.

## Standards applied

`sdd/reviews/20261125-sol-pr379-architecture.md`: one PID 1 RLIMIT (`LimitNPROC=64`) left `RestrictAddressFamilies` and `CPUQuota` unset, and the checkbox rule keeps `plan.md` `[ ]` until the whole `003B-4C` gate is done. `sdd/reviews/20261124-sol-pr374-architecture.md`: one RLIMIT (`LimitNOFILE=1024`) does not close `003B-4C` or the ADR `Ready` list, and `RestrictAddressFamilies` stays out after `ENXIO`. This cut attests one more RLIMIT (`LimitCORE=0`) and still leaves that checkbox open. `sdd/reviews/20261122-sol-pr358-architecture.md`: one PID 1 boundary does not close `003B-4C`, `Ready`, or HTTP. Closed unit kinds stay `UnitKind` / `UnitState` / `JobState`. Android architecture standards and the Spring/Kotlin backend standards do not apply to the behavior under review: the diff has no ViewModel, UiState, controller, or Kotlin change.

## Findings

No P0. No P1. No P2. No P3.

## Residuals (not findings)

- `003B-4B-3`, `003B-4B-4`, aggregate `003B-4B`, `003B-4C`, `003B-4`, `MEDIA-NORMALIZE-004`, TASK-005, and #7 stay open. No `Ready`, no catalog HTTP, no secrets, no deploy. This review does not check off `003B-4C`, `003B-4B-3`, `003B-4B-4`, Ready, HTTP, or TASK-005.
- `RestrictAddressFamilies` stays unset after `ENXIO`. `CPUQuota` stays unset. Socket family stays out. Global quota, terminals without ACK, FD/mmap after seal, restart on every durable transition, and remaining RLIMIT stay open. This diff does not add them.
- `LimitCORE=0` is one RLIMIT. It disables core dumps on the worker service. It is not the full ADR `Ready` RLIMIT list. `LimitNOFILE` and `LimitNPROC` were already attested. Other RLIMIT settings stay unset. One `LimitCORE` does not close `003B-4C`.
- The PID 1 attest reads the unit property with `systemctl show`. It does not read `/proc/<pid>/limits`. It follows the same shape as the `LimitNOFILE` and `LimitNPROC` readbacks: a rejected start fails the harness, and a returned `Failed` state is not separately asserted before the property check. ADR-001 still wants the effective unit and the real cgroup files before `Ready`.
- The unit test matches `LimitCORE` by a debug form that contains the decimal form of `WORKER_LIMIT_CORE`, which is the substring `0`. That substring also appears in other ceilings, including `1024`. The PID 1 attest reads the effective property as `0` or a value that starts with `0:`, which also accepts a hard limit other than zero when systemd prints `0:…`. The hosted readback matched.
- `meta.md` is not in the diff and is not updated to head `6e4d1c9`. The implementation banner and progress carry this cut. That matches the earlier feature cuts, which updated `meta.md` when the reviews were persisted.
- This review file is not a GitHub approval, a merge, or a `Ready` declaration, and it does not mark `003B-4C` closed.

## Conclusion

Head `6e4d1c9709f4259575bd1c150d9e5a5d3bd3613b` derives `LimitCORE=0` inside `worker_properties`. The client does not supply it. `RestrictAddressFamilies` and `CPUQuota` stay unset. The PID 1 harness starts the derived worker for job `[0xff; 16]` and reads `LimitCORE` back as `0` or `0:…`. That is one RLIMIT, not the ADR `Ready` list. `003B-4C`, `Ready`, and HTTP stay open. Verify `45556235165` is success 7/7 on this SHA, none cancelled, and `media-broker-pid1` `139008921069` passed `pid1_worker_limit_core` (`14 passed; 0 failed`). No P0–P3. `APPROVED` for the architecture lane. This file is not a GitHub approval and does not mark `003B-4C` closed.
