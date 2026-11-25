VERDICT: APPROVED

## Evidence identity

- provider: xAI
- model: Grok 4.7
- effort: medium
- substitute-for: gpt-5.6-sol-medium (no quota)
- lane: architecture
- independent of the security lane. This review did not read `sdd/reviews/20261125-sol-pr383-security.md`
- PR: 383 OPEN `feat(media): attest PID 1 LimitFSIZE on the worker unit` https://github.com/AgustinFalcon/storecore/pull/383
- branch: `feat/media-broker-4c-limit-fsize-20261125` (worktree left on this branch)
- head SHA: `d7f773a5a88c7cc71c901433276a7a3e9910ef04`
- `git rev-parse HEAD`: `d7f773a5a88c7cc71c901433276a7a3e9910ef04` (matches GitHub `headRefOid`)
- remote feature tip: `git ls-remote origin refs/heads/feat/media-broker-4c-limit-fsize-20261125` is the same SHA
- GitHub `baseRefOid` / `origin/master` / `git merge-base origin/master HEAD`: `65a73c385e017ede84b7d97dedd1a300d789fb3b` (`docs: persist PR 381 dual Grok reviews without closing 4C (#382)`)
- GitHub mergeability: `MERGEABLE`, `mergeStateStatus` `CLEAN`, state `OPEN`
- diff identity: `git diff --name-status origin/master...HEAD` is three modifications; `git diff --stat` is 3 files, +91 / −11; `git diff --check` exit 0 (no whitespace errors). One commit on the merge-base: `d7f773a5a88c7cc71c901433276a7a3e9910ef04` `feat(media): attest PID 1 LimitFSIZE on the worker unit`. Untracked persist-of-persist files (`sdd/reviews/20261124-sol-pr365-*.md`, `sdd/reviews/20261124-sol-pr373-*.md`, `sdd/reviews/20261125-sol-pr376-*.md`, `sdd/reviews/20261125-sol-pr378-*.md`, `sdd/reviews/20261125-sol-pr380-*.md`, `sdd/reviews/20261125-sol-pr382-*.md`) are outside this three-dot diff and are not part of this review.
- Verify on this head: run `45560675895` (`pull_request`, name `Verify`, status `completed`, conclusion `success`, `headSha` `d7f773a5a88c7cc71c901433276a7a3e9910ef04`). 7/7 success. None cancelled. One Verify run on this SHA. Billing was not an exception on this run. `gh pr checks 383` reports the same seven jobs `pass`.
- local cargo: not run. This host is Windows. The new PID 1 test is `#[ignore]` and runs in `media-broker-pid1`. Focused validation is that hosted Verify run. Its log records `dbus::tests::pid1_worker_limit_fsize ... ok` inside `storecore-media-broker` lib unittests (`src/lib.rs`, `running 15 tests`) and `test result: ok. 15 passed; 0 failed; 0 ignored; 0 measured; 62 filtered out`.
- this file is not a GitHub approval and does not mark `003B-4C` closed

## Job conclusions (Verify 45560675895)

Seven jobs, all `completed` / `success` on `d7f773a5a88c7cc71c901433276a7a3e9910ef04`. None cancelled:

- repository-hygiene: success (`139023354499`)
- backend: success (`139023430002`)
- media-broker: success (`139023429700`)
- media-broker-pid1: success (`139023429723`)
- frontend: success (`139023429847`)
- productive-routes-real-e2e: success (`139023429680`)
- unified-access-real-e2e: success (`139023429730`)

`media-broker-pid1` `139023429723` is the job that executed `pid1_worker_limit_fsize`. The media-broker lib unittests finished `15 passed; 0 failed`. The integration-test result lines in that step are `0 passed` (`protocol_vectors`, `snapshot`, `transport`). `media-broker` `139023429700` passed format, lints, and Linux tests, so this tree did not leave a clippy failure.

## Diff reviewed

`git diff origin/master...HEAD`: 3 files, +91 / −11. One commit on `65a73c385e017ede84b7d97dedd1a300d789fb3b`:

- `d7f773a5a88c7cc71c901433276a7a3e9910ef04` `feat(media): attest PID 1 LimitFSIZE on the worker unit`

| File | change |
| --- | --- |
| `backend/media-broker/src/dbus.rs` | `worker_properties` gains internal `LimitFSIZE` equal to `crate::systemd::MOUNT_BYTES` (`48 * 1024 * 1024`). `RestrictAddressFamilies` and `CPUQuota` stay absent. The existing worker-property unit test also locks the new key and those absences. Ignored PID 1 test starts the derived worker and reads `LimitFSIZE` back |
| `sdd/STATUS.md` | implementation banner names the derived `LimitFSIZE` at the 48 MiB workspace size, leaves `RestrictAddressFamilies` and `CPUQuota` out, and leaves `003B-4C` open |
| `sdd/wip/.../4-implementation/progress.md` | same claim; `003B-4C` is not marked |

`plan.md`, `spec.md`, `meta.md`, and ADR-001 are not in the diff. No Kotlin, Angular, workflow, migration, fixture, lockfile, HTTP route, or secret. `CPUQuota` does not appear as a worker property. `RestrictAddressFamilies` appears only as a negative key assertion and in the STATUS/progress retreat.

## Why this cut

`003B-4C` in `plan.md` on this SHA is still `[ ]` (line 89): harness Linux real con UID A/UID B, SELF_TEST/NORMALIZE dentro de la unidad, attestación efectiva de cgroup v2/mount/quota, aislamiento entre jobs, fallos y reinicios. The spec paragraph still requires SELF_TEST/NORMALIZE, isolation, per-job and global quota, terminals without ACK, FD/mmap after seal, OOM/timeout, cgroup termination, substitution rejection, and restart on every durable transition before that gate can close. ADR-001 still requires, before `Ready`, namespaces, no `AF_INET`/`AF_INET6`, `CPUQuota`, and RLIMIT, and still says only `4A+4B+4C` can complete `003B-4`. ADR-001 also says each job tmpfs is 48 MiB and that `LimitFSIZE` is per-file defense and does not count as aggregated quota. `003B-4B-3`, `003B-4B-4`, `MEDIA-NORMALIZE-003B-4`, `MEDIA-NORMALIZE-004`, and `TASK-005` stay `[ ]`.

STATUS says this cut does not close `003B-4C`. The harness derives `LimitFSIZE` to the workspace size (48 MiB) and PID 1 reads that property. `RestrictAddressFamilies` stays out after the `ENXIO` retreat recorded on the #374 tree. `CPUQuota` stays out. Socket family, global quota, terminals without ACK, FD/mmap after seal, restart on every durable transition, remaining RLIMIT, and `Ready` stay absent. No HTTP.

The GitHub title and body match the tree. The body says the client does not supply `LimitFSIZE`, that the value is the IMAGE_IO_V1 workspace size (48 MiB) and is per-file defense rather than aggregated tmpfs quota, that PID 1 reads the effective property, that `RestrictAddressFamilies` and `CPUQuota` stay unset, and that `003B-4C` stays open. The PR test plan leaves Verify, the dual reviews, and the `003B-4C` checkbox unchecked. This review does not check them off.

## Implementation

`MOUNT_BYTES` is `48 * 1024 * 1024` (50331648). `WORKER_LIMIT_FSIZE` is that constant. `WORKER_LIMIT_NOFILE` is already `1024`. `WORKER_LIMIT_NPROC` and `WORKER_TASKS_MAX` are already `64`. `WORKER_LIMIT_CORE` is already `0`. They are separate crate constants. `LimitFSIZE` is not a parameter. `worker_properties` is the only worker property bag, and `properties(UnitKind::Worker)` is what `start_transient` sends to `StartTransientUnit`. The mount bag is unchanged. The vector has no `RestrictAddressFamilies` and no `CPUQuota`. `TasksMax` stays on the worker bag. `TransientUnits::derive` still takes only `JobId`, the jobs root, `Principal`, and `&ApprovedRuntime`. Its contract still says callers cannot supply unit names, `Where`, or `ExecStart`. The client does not supply the per-file ceiling.

`derived_worker_oom_kills_the_cgroup` asserts `LimitFSIZE` is present and that its debug form contains the decimal form of `WORKER_LIMIT_FSIZE`, keeps the `LimitNOFILE` `1024`, `LimitNPROC` `64`, and `LimitCORE` `0` assertions and the `PrivateNetwork` assertion, and asserts `RestrictAddressFamilies` and `CPUQuota` are absent. `UnitKind`, `UnitState`, and `JobState` stay the closed unit and job types. `LimitFSIZE` is an internal property integer, not a new string state in a view.

`pid1_worker_limit_fsize` is ignored unless `/proc/1/comm` is `systemd` and euid is 0. It derives job `[0x10; 16]` and principal `2102:2102`, starts the mount, writes the existing `SELF_TEST` `request.bin`, and starts the worker through PID 1. A rejected `StartTransientUnit` fails the harness. `systemctl show -p LimitFSIZE --value` must equal the decimal form of `WORKER_LIMIT_FSIZE` or start with that decimal followed by `:`. Stop of the worker and the mount accepts `Inactive` or `Failed`. The hosted job reached `ok` (`15 passed; 0 failed`).

That property is one RLIMIT (`RLIMIT_FSIZE`) on the worker service. PID 1 accepted the integer. `LimitNOFILE`, `LimitNPROC`, and `LimitCORE` remain the RLIMIT settings already on the unit. `LimitFSIZE` does not replace them and does not replace the tmpfs size. `RestrictAddressFamilies` is still unset, so the address-family list is not the attested cut. `CPUQuota` is still unset.

## Ledger

- `sdd/STATUS.md` banner is `4C RLIMIT FSIZE del worker`. It says this cut does not close `003B-4C`. It names the PID 1 read of derived `LimitFSIZE` at 48 MiB. `RestrictAddressFamilies` and `CPUQuota` stay out. Socket family, global quota, terminals without ACK, FD/mmap after seal, restart on every durable transition, remaining RLIMIT, and `Ready` stay absent. `003B-4B-3`, `003B-4B-4`, `003B-4C`, `003B-4`, TASK-005, and #7 stay open. No media HTTP.
- The master paragraph under that banner still describes merged `083d8340209ad6f8f4a7f85139377df5f60338dc` / PR #381. This diff does not rewrite it. Live `origin/master` `65a73c385e017ede84b7d97dedd1a300d789fb3b` is the persist of those #381 reviews and is the merge-base of this PR. On that merged tree, `003B-4C` is still unmarked. The implementation banner describes this unmerged candidate.
- `progress.md` records the same 48 MiB `LimitFSIZE` readback and that `003B-4C` is not marked. `RestrictAddressFamilies` and `CPUQuota` stay out. No socket family, global quota, `Ready`, or HTTP.
- `plan.md` is not in the diff. `MEDIA-NORMALIZE-003B-4C` remains `- [ ]` (line 89). `003B-4B-3`, `003B-4B-4`, and `TASK-005` remain `- [ ]`.

## Standards applied

`sdd/reviews/20261125-sol-pr381-architecture.md`: one PID 1 RLIMIT (`LimitCORE=0`) left `RestrictAddressFamilies` and `CPUQuota` unset, and the checkbox rule keeps `plan.md` `[ ]` until the whole `003B-4C` gate is done. That review carries the same rule from `sdd/reviews/20261125-sol-pr379-architecture.md` (`LimitNPROC=64`) and `sdd/reviews/20261124-sol-pr374-architecture.md` (`LimitNOFILE=1024`, `RestrictAddressFamilies` stays out after `ENXIO`). This cut attests one more RLIMIT (`LimitFSIZE` = `MOUNT_BYTES`) and still leaves that checkbox open. `sdd/reviews/20261122-sol-pr358-architecture.md`, as applied by the #381 review: one PID 1 boundary does not close `003B-4C`, `Ready`, or HTTP. Closed unit kinds stay `UnitKind` / `UnitState` / `JobState`. Android architecture standards and the Spring/Kotlin backend standards do not apply to the behavior under review: the diff has no ViewModel, UiState, controller, or Kotlin change.

## Findings

No P0. No P1. No P2. No P3.

## Residuals (not findings)

- `003B-4B-3`, `003B-4B-4`, aggregate `003B-4B`, `003B-4C`, `003B-4`, `MEDIA-NORMALIZE-004`, TASK-005, and #7 stay open. No `Ready`, no catalog HTTP, no secrets, no deploy. This review does not check off `003B-4C`, `003B-4B-3`, `003B-4B-4`, Ready, HTTP, or TASK-005.
- `RestrictAddressFamilies` stays unset after `ENXIO`. `CPUQuota` stays unset. Socket family stays out. Global quota, terminals without ACK, FD/mmap after seal, restart on every durable transition, and remaining RLIMIT stay open. This diff does not add them.
- `LimitFSIZE` is one RLIMIT (`RLIMIT_FSIZE`) set to the workspace byte count. ADR-001 keeps it as per-file defense and says it does not count as aggregated tmpfs quota. It is not the full ADR `Ready` RLIMIT list. `LimitNOFILE`, `LimitNPROC`, and `LimitCORE` were already attested. Other RLIMIT settings stay unset. One `LimitFSIZE` does not close `003B-4C`.
- The ceiling aliases `crate::systemd::MOUNT_BYTES` (`48 * 1024 * 1024`). The tmpfs option string remains the pre-existing literal `size=48M` in `tmpfs_options`, which is the same 48 MiB and is not generated from `MOUNT_BYTES`. The two expressions match today. Changing one would not move the other.
- The PID 1 attest reads the unit property with `systemctl show`. It does not read `/proc/<pid>/limits`. `start_transient` returns `Ok(Failed)` when `wait_state` sees `Failed`, and this test only rejects `Err`. A returned `Failed` state is not separately asserted before the property check. ADR-001 still wants the effective unit and the real cgroup files before `Ready`.
- The unit test matches `LimitFSIZE` by a debug form that contains the decimal form of `WORKER_LIMIT_FSIZE`. The PID 1 attest accepts that decimal or a value that starts with `<decimal>:`, which also accepts a different hard limit when systemd prints `soft:hard`. The hosted readback matched.
- `meta.md` is not in the diff and is not updated to head `d7f773a`. The implementation banner and progress carry this cut. That matches the earlier feature cuts, which updated `meta.md` when the reviews were persisted.
- This review file is not a GitHub approval, a merge, or a `Ready` declaration, and it does not mark `003B-4C` closed.

## Conclusion

Head `d7f773a5a88c7cc71c901433276a7a3e9910ef04` derives `LimitFSIZE` inside `worker_properties` from `crate::systemd::MOUNT_BYTES` (48 MiB). The client does not supply it. It is per-file defense, not aggregated quota. `RestrictAddressFamilies` and `CPUQuota` stay unset. The PID 1 harness starts the derived worker for job `[0x10; 16]` and reads `LimitFSIZE` back. That is one RLIMIT, not the ADR `Ready` list. `003B-4C`, `Ready`, and HTTP stay open. Verify `45560675895` is success 7/7 on this SHA, none cancelled, and `media-broker-pid1` `139023429723` passed `pid1_worker_limit_fsize` (`15 passed; 0 failed`). No P0–P3. `APPROVED` for the architecture lane. This file is not a GitHub approval and does not mark `003B-4C` closed.
