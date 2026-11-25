VERDICT: APPROVED

## Evidence identity

- provider: xAI
- model: Grok 4.7
- effort: medium
- substitute-for: gpt-5.6-sol-medium (no quota)
- lane: architecture
- independent of the security lane
- PR: 374 OPEN `feat(media): derive worker LimitNOFILE after RestrictAddressFamilies ENXIO` https://github.com/AgustinFalcon/storecore/pull/374
- branch: `feat/media-broker-4c-socket-family-20261124`
- head SHA: `69827b8ed2b41e91daf72c4ad7c50d57c26046df`
- `git rev-parse HEAD`: `69827b8ed2b41e91daf72c4ad7c50d57c26046df` (matches GitHub `headRefOid`)
- GitHub `baseRefOid` / `origin/master` / `git merge-base origin/master HEAD`: `527705c18099afe74d78434e55d259350ba3c2a0` (`docs: persist PR 366 dual Grok reviews without closing 4C (#373)`)
- diff identity: 3 files, +86 / −8 (`backend/media-broker/src/dbus.rs`, `sdd/STATUS.md`, `sdd/wip/20261116-catalog-media-upload-and-variant-gallery/4-implementation/progress.md`)
- Verify on this head: run `45541300889` (`pull_request`, name `Verify`, status `completed`, conclusion `success`, `headSha` `69827b8ed2b41e91daf72c4ad7c50d57c26046df`). 7/7 success. None cancelled. One Verify run on this SHA. Billing was not an exception on this run.
- local cargo: not run. This host is Windows. The new PID 1 test is `#[ignore]` and runs in `media-broker-pid1`. Focused validation is that hosted Verify run. Its log records `dbus::tests::pid1_worker_limit_nofile ... ok` and `test result: ok. 11 passed; 0 failed; 0 ignored; 0 measured; 62 filtered out`.
- this file is not a GitHub approval and does not mark `003B-4C` closed

## Job conclusions (Verify 45541300889)

Seven jobs, all `completed` / `success` on `69827b8ed2b41e91daf72c4ad7c50d57c26046df`. None cancelled:

- repository-hygiene: success (`138960198371`)
- media-broker: success (`138960283454`)
- frontend: success (`138960283458`)
- unified-access-real-e2e: success (`138960283460`)
- backend: success (`138960283488`)
- productive-routes-real-e2e: success (`138960283494`)
- media-broker-pid1: success (`138960283521`)

`media-broker-pid1` `138960283521` is the job that executed `pid1_worker_limit_nofile`. The dbus binary finished `11 passed; 0 failed`.

## Diff reviewed

`git diff origin/master...HEAD`: 3 files, +86 / −8. Three commits on `527705c18099afe74d78434e55d259350ba3c2a0`:

- `32397450dd0cdb74a14a31a6d1221c5892c311be` `feat(media): derive worker RestrictAddressFamilies UNIX/NETLINK`
- `7822e75acf0bb4ca8d7a59cb7863844577f2e464` `fix(media): drop RestrictAddressFamilies, derive LimitNOFILE`
- `69827b8ed2b41e91daf72c4ad7c50d57c26046df` `fix(media): import WORKER_LIMIT_NOFILE in dbus tests`

| File | change |
| --- | --- |
| `backend/media-broker/src/dbus.rs` | `worker_properties` gains internal `LimitNOFILE` `1024u64`. `RestrictAddressFamilies` and `CPUQuota` stay absent. The kill-property unit test also locks those absences and the NOFILE constant. Ignored PID 1 test starts the derived worker and reads `LimitNOFILE` back |
| `sdd/STATUS.md` | implementation banner names the `ENXIO` retreat and the `LimitNOFILE=1024` readback, and leaves `003B-4C` open |
| `sdd/wip/.../4-implementation/progress.md` | same claim; `003B-4C` is not marked |

`plan.md`, `spec.md`, `meta.md`, and ADR-001 are not in the diff. No Kotlin, Angular, workflow, migration, fixture, lockfile, HTTP route, or secret. `CPUQuota` does not appear as a worker property. `RestrictAddressFamilies` appears only as a negative key assertion and in the STATUS/progress retreat.

## Why this cut

`003B-4C` in `plan.md` on this SHA is still `[ ]` (line 89): harness Linux real con UID A/UID B, SELF_TEST/NORMALIZE dentro de la unidad, attestación efectiva de cgroup v2/mount/quota, aislamiento entre jobs, fallos y reinicios. The spec paragraph still requires SELF_TEST/NORMALIZE, isolation, per-job and global quota, terminals without ACK, FD/mmap after seal, OOM/timeout, cgroup termination, substitution rejection, and restart on every durable transition before that gate can close. ADR-001 still requires, before `Ready`, no `AF_INET`/`AF_INET6`, `CPUQuota`, namespaces, and RLIMIT, and still says only `4A+4B+4C` can complete `003B-4`. `003B-4B-3`, `003B-4B-4`, `MEDIA-NORMALIZE-003B-4`, `MEDIA-NORMALIZE-004`, and `TASK-005` stay `[ ]`.

STATUS says this cut does not close `003B-4C`. PID 1 `StartTransientUnit` rejected `RestrictAddressFamilies` with `ENXIO` (Unexpected message contents), the same class of retreat as `CPUQuota`. The harness derives `LimitNOFILE=1024` and PID 1 reads that property. Socket family, namespaces, `CPUQuota`, and `Ready` stay absent. No HTTP.

The GitHub title matches the tree. The PR body does not. Its summary still says this cut derives `RestrictAddressFamilies=AF_UNIX AF_NETLINK`, that PID 1 reads the family list, that `AF_INET` stays off that list, and that RLIMIT is still out. The test plan still names `pid1_worker_restricts_address_families`. Commit `7822e75` and STATUS/progress drop the socket-family property and attest `LimitNOFILE` instead. The tree is the authority. The PR test plan leaves Verify, the dual reviews, and the `003B-4C` checkbox unchecked. This review does not check them off.

## Implementation

`WORKER_LIMIT_NOFILE` is `1024`. It is a crate constant. `worker_properties` is the only worker property bag, and `properties(UnitKind::Worker)` is what `start` sends to `StartTransientUnit`. The new key is `LimitNOFILE` with `Value::from(WORKER_LIMIT_NOFILE)`. The vector has no `RestrictAddressFamilies` and no `CPUQuota`. `TransientUnits::derive` still takes only `JobId`, the jobs root, `Principal`, and `&ApprovedRuntime`. The client does not supply the ceiling.

`derived_worker_oom_kills_the_cgroup` asserts `LimitNOFILE` is present and that its debug form contains `1024`, and asserts `RestrictAddressFamilies` and `CPUQuota` are absent. `UnitKind` / `UnitState` stay the closed unit types. `LimitNOFILE` is an internal property integer, not a new string state in a view.

`pid1_worker_limit_nofile` is ignored unless `/proc/1/comm` is `systemd` and euid is 0. It derives job `[0xcc; 16]` and principal `2102:2102`, starts the mount, writes the existing `SELF_TEST` `request.bin`, and starts the worker through PID 1. A rejected `StartTransientUnit` fails the harness. `systemctl show -p LimitNOFILE --value` must be `1024` or start with `1024:`. Stop of the worker and the mount accepts `Inactive` or `Failed`. The hosted job reached `ok` (`11 passed; 0 failed`).

That shape matches the failed alternative recorded in `7822e75`. `RestrictAddressFamilies` on `StartTransientUnit` returned `ENXIO`, so the socket-family list is not the attested cut. `LimitNOFILE` is the property PID 1 accepted and exposed. The third commit only imports `WORKER_LIMIT_NOFILE` into the dbus tests so the unit assertion compiles against the constant.

## Ledger

- `sdd/STATUS.md` banner is `4C RLIMIT NOFILE del worker`. It says this cut does not close `003B-4C`. It names the `ENXIO` retreat of `RestrictAddressFamilies` and the PID 1 read of derived `LimitNOFILE=1024`. `CPUQuota`, socket family, namespaces, and `Ready` stay absent. `003B-4B-3`, `003B-4B-4`, `003B-4C`, `003B-4`, TASK-005, and #7 stay open. No media HTTP.
- The master paragraph under that banner still describes merged `ff30b8aaffa5b6ffea077a51c8dedf335ba3e935` / PR #366. This diff does not rewrite it. Live `origin/master` `527705c` is the persist of those #366 reviews and is the merge-base of this PR. On that merged tree, `003B-4C` is still unmarked. The implementation banner describes this unmerged candidate.
- `progress.md` records the same `ENXIO` retreat, the same `LimitNOFILE=1024` readback, and that `003B-4C` is not marked. `CPUQuota` and socket family stay out. No `Ready` or HTTP.
- `plan.md` is not in the diff. `MEDIA-NORMALIZE-003B-4C` remains `- [ ]` (line 89). `003B-4B-3`, `003B-4B-4`, and `TASK-005` remain `- [ ]`.

## Standards applied

`sdd/reviews/20261122-sol-pr358-architecture.md`: a PID 1 attest of one boundary stays inside the harness and leaves `003B-4C`, `Ready`, and HTTP open. `sdd/reviews/20261122-sol-pr346-architecture.md`: `CPUQuota` stays unset after PID 1 rejected it, and a later persist follows the tree when the GitHub summary still names the dropped property. `RestrictAddressFamilies` is that same class: PID 1 returned `ENXIO`, the property is not on the unit, and `CPUQuota` stays unset. `sdd/reviews/20261124-sol-pr366-architecture.md`: the previous cut left socket family and RLIMIT inside open `003B-4C`. This cut attests one RLIMIT (`NOFILE=1024`) and still leaves socket family, namespaces, `CPUQuota`, and the rest of that gate open. The checkbox rule in those reviews still applies: `plan.md` stays `[ ]` until the whole `003B-4C` gate is done. Closed unit kinds stay `UnitKind` / `UnitState`. Android architecture standards and the Spring/Kotlin backend standards do not apply to the behavior under review: the diff has no ViewModel, UiState, controller, or Kotlin change.

## Findings

No P0. No P1. No P2. No P3.

## Residuals (not findings)

- `003B-4B-3`, `003B-4B-4`, aggregate `003B-4B`, `003B-4C`, `003B-4`, `MEDIA-NORMALIZE-004`, TASK-005, and #7 stay open. No `Ready`, no catalog HTTP, no secrets, no deploy. This review does not check off `003B-4C`, Ready, HTTP, or TASK-005.
- Socket family stays out. `RestrictAddressFamilies` is not derived. `AF_INET` and `AF_INET6` are not removed. `PrivateNetwork` and namespaces stay unset. `CPUQuota` stays unset. Global quota, terminals without ACK, FD/mmap after seal, and restart on every durable transition stay out. This diff does not add them. One `LimitNOFILE` does not close `003B-4C` and does not satisfy the ADR `Ready` list.
- The PID 1 attest reads the unit property with `systemctl show`. It does not read `/proc/<pid>/limits`. ADR-001 still wants the effective unit and the real cgroup files before `Ready`.
- The PID 1 string check accepts `1024` or any value that starts with `1024:`. The derived property is one `u64`. The hosted readback matched.
- The GitHub summary and test plan still describe `RestrictAddressFamilies` and `pid1_worker_restricts_address_families`. Commit `7822e75` and STATUS/progress do not. A later persist should follow the tree. Same class as the #346 summary that still named `CPUQuota`.
- `meta.md` is not in the diff and is not updated to head `69827b8`. The implementation banner and progress carry this cut. That matches the earlier feature cuts, which updated `meta.md` when the reviews were persisted.
- This review file is not a GitHub approval, a merge, or a `Ready` declaration, and it does not mark `003B-4C` closed.

## Conclusion

Head `69827b8ed2b41e91daf72c4ad7c50d57c26046df` does not derive `RestrictAddressFamilies`. PID 1 rejected that property with `ENXIO`, the same class as `CPUQuota`. `worker_properties` derives `LimitNOFILE=1024` internally. The client does not supply it. `CPUQuota` stays unset. The PID 1 harness starts the derived worker for job `[0xcc; 16]` and reads `LimitNOFILE` back as `1024` or `1024:…`. `003B-4C`, `Ready`, and HTTP stay open. Verify `45541300889` is success 7/7 on this SHA, none cancelled, and `media-broker-pid1` `138960283521` passed `pid1_worker_limit_nofile` (`11 passed; 0 failed`). No P0–P3. `APPROVED` for the architecture lane. This file is not a GitHub approval and does not mark `003B-4C` closed.
