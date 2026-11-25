VERDICT: APPROVED

## Evidence identity

- provider: xAI
- model: Grok 4.7
- effort: medium
- substitute-for: gpt-5.6-sol-medium (no quota)
- lane: architecture
- independent of the security lane
- PR: 377 OPEN `feat(media): attest PID 1 PrivateNetwork on the worker unit` https://github.com/AgustinFalcon/storecore/pull/377
- branch: `feat/media-broker-4c-private-network-20261124` (worktree left on this branch)
- head SHA: `bc7bf2038da15d937820ca7bd7b2e1d10996ac89`
- `git rev-parse HEAD`: `bc7bf2038da15d937820ca7bd7b2e1d10996ac89` (matches GitHub `headRefOid`)
- remote feature tip: `git ls-remote origin refs/heads/feat/media-broker-4c-private-network-20261124` and `git rev-parse FETCH_HEAD` after fetching that branch are the same SHA. This clone has no local remote-tracking ref named `origin/feat/media-broker-4c-private-network-20261124`.
- GitHub `baseRefOid` / `origin/master` / `git merge-base origin/master HEAD`: `fd69baa3e5ebc3bfd81eddecda07bc4871132c2a` (`docs: persist PR 374 dual Grok reviews without closing 4C (#376)`)
- GitHub mergeability: `MERGEABLE`, `mergeStateStatus` `CLEAN`
- diff identity: `git diff --name-status origin/master...HEAD` is three modifications; `git diff --stat` is 3 files, +80 / −6; `git diff --check` exit 0 (no whitespace errors). One commit on the merge-base: `bc7bf2038da15d937820ca7bd7b2e1d10996ac89` `feat(media): attest PID 1 PrivateNetwork on the worker unit`. Untracked persist-of-persist files (`sdd/reviews/20261124-sol-pr365-*.md`, `sdd/reviews/20261124-sol-pr373-*.md`, `sdd/reviews/20261125-sol-pr376-*.md`) are outside this three-dot diff and are not part of this review.
- Verify on this head: run `45547855613` (`pull_request`, name `Verify`, status `completed`, conclusion `success`, `headSha` `bc7bf2038da15d937820ca7bd7b2e1d10996ac89`). 7/7 success. None cancelled. One Verify run on this SHA. Billing was not an exception on this run. `gh pr checks 377` reports the same seven jobs `pass`.
- local cargo: not run. This host is Windows. The new PID 1 test is `#[ignore]` and runs in `media-broker-pid1`. Focused validation is that hosted Verify run. Its log records `dbus::tests::pid1_worker_private_network ... ok` and `test result: ok. 12 passed; 0 failed; 0 ignored; 0 measured; 62 filtered out`.
- this file is not a GitHub approval and does not mark `003B-4C` closed

## Job conclusions (Verify 45547855613)

Seven jobs, all `completed` / `success` on `bc7bf2038da15d937820ca7bd7b2e1d10996ac89`. None cancelled:

- repository-hygiene: success (`138981659377`)
- backend: success (`138981755619`)
- media-broker: success (`138981755631`)
- media-broker-pid1: success (`138981755632`)
- frontend: success (`138981755620`)
- productive-routes-real-e2e: success (`138981755673`)
- unified-access-real-e2e: success (`138981755657`)

`media-broker-pid1` `138981755632` is the job that executed `pid1_worker_private_network`. The dbus binary finished `12 passed; 0 failed`. The other crate result lines in that step are `0 passed`.

## Diff reviewed

`git diff origin/master...HEAD`: 3 files, +80 / −6. One commit on `fd69baa3e5ebc3bfd81eddecda07bc4871132c2a`:

- `bc7bf2038da15d937820ca7bd7b2e1d10996ac89` `feat(media): attest PID 1 PrivateNetwork on the worker unit`

| File | change |
| --- | --- |
| `backend/media-broker/src/dbus.rs` | `worker_properties` gains internal `PrivateNetwork` `true`. `RestrictAddressFamilies` and `CPUQuota` stay absent. The existing worker-property unit test also locks the new key and those absences. Ignored PID 1 test starts the derived worker and reads `PrivateNetwork` back |
| `sdd/STATUS.md` | implementation banner names the derived `PrivateNetwork=true` readback, leaves `RestrictAddressFamilies` and `CPUQuota` out, and leaves `003B-4C` open |
| `sdd/wip/.../4-implementation/progress.md` | same claim; `003B-4C` is not marked |

`plan.md`, `spec.md`, `meta.md`, and ADR-001 are not in the diff. No Kotlin, Angular, workflow, migration, fixture, lockfile, HTTP route, or secret. `CPUQuota` does not appear as a worker property. `RestrictAddressFamilies` appears only as a negative key assertion and in the STATUS/progress retreat.

## Why this cut

`003B-4C` in `plan.md` on this SHA is still `[ ]` (line 89): harness Linux real con UID A/UID B, SELF_TEST/NORMALIZE dentro de la unidad, attestación efectiva de cgroup v2/mount/quota, aislamiento entre jobs, fallos y reinicios. The spec paragraph still requires SELF_TEST/NORMALIZE, isolation, per-job and global quota, terminals without ACK, FD/mmap after seal, OOM/timeout, cgroup termination, substitution rejection, and restart on every durable transition before that gate can close. ADR-001 still requires, before `Ready`, namespaces, no `AF_INET`/`AF_INET6`, `CPUQuota`, and RLIMIT, and still says only `4A+4B+4C` can complete `003B-4`. `003B-4B-3`, `003B-4B-4`, `MEDIA-NORMALIZE-003B-4`, `MEDIA-NORMALIZE-004`, and `TASK-005` stay `[ ]`.

STATUS says this cut does not close `003B-4C`. The harness derives `PrivateNetwork=true` and PID 1 reads that property. `RestrictAddressFamilies` stays out after the `ENXIO` retreat recorded on the #374 tree. `CPUQuota` stays out. Socket family, global quota, terminals without ACK, FD/mmap after seal, restart on every durable transition, remaining RLIMIT, and `Ready` stay absent. No HTTP.

The GitHub title and body match the tree. The body says the client does not supply `PrivateNetwork`, that PID 1 reads the effective property, that `RestrictAddressFamilies` and `CPUQuota` stay unset, and that `003B-4C` stays open. The PR test plan leaves Verify, the dual reviews, and the `003B-4C` checkbox unchecked. This review does not check them off.

## Implementation

`PrivateNetwork` is the boolean literal `true` inside `worker_properties`. It is not a parameter. `worker_properties` is the only worker property bag, and `properties(UnitKind::Worker)` is what `start_transient` sends to `StartTransientUnit`. The mount bag is unchanged. The vector has no `RestrictAddressFamilies` and no `CPUQuota`. `TransientUnits::derive` still takes only `JobId`, the jobs root, `Principal`, and `&ApprovedRuntime`. Its contract still says callers cannot supply unit names, `Where`, or `ExecStart`. The client does not supply the network flag.

`derived_worker_oom_kills_the_cgroup` asserts `PrivateNetwork` is present and that its debug form contains `true`, keeps the `LimitNOFILE` `1024` assertion, and asserts `RestrictAddressFamilies` and `CPUQuota` are absent. `UnitKind`, `UnitState`, and `JobState` stay the closed unit and job types. `PrivateNetwork` is an internal property boolean, not a new string state in a view.

`pid1_worker_private_network` is ignored unless `/proc/1/comm` is `systemd` and euid is 0. It derives job `[0xdd; 16]` and principal `2102:2102`, starts the mount, writes the existing `SELF_TEST` `request.bin`, and starts the worker through PID 1. A rejected `StartTransientUnit` fails the harness. `systemctl show -p PrivateNetwork --value` must be `yes` or `true`. Stop of the worker and the mount accepts `Inactive` or `Failed`. The hosted job reached `ok` (`12 passed; 0 failed`).

That property is one network namespace on the worker service. PID 1 accepted the boolean. The job tmpfs remains a PID 1 `.mount`; this key does not move the workspace into a private mount namespace. `RestrictAddressFamilies` is still unset, so the address-family list is not the attested cut. Loopback inside the private netns is not the ADR removal of `AF_INET`/`AF_INET6`.

## Ledger

- `sdd/STATUS.md` banner is `4C PrivateNetwork del worker`. It says this cut does not close `003B-4C`. It names the PID 1 read of derived `PrivateNetwork=true`. `RestrictAddressFamilies` and `CPUQuota` stay out. Socket family, global quota, terminals without ACK, FD/mmap after seal, restart on every durable transition, remaining RLIMIT, and `Ready` stay absent. `003B-4B-3`, `003B-4B-4`, `003B-4C`, `003B-4`, TASK-005, and #7 stay open. No media HTTP.
- The master paragraph under that banner still describes merged `c146fdd8c062fa0e75da219e2e84a7d287a1cc14` / PR #374. This diff does not rewrite it. Live `origin/master` `fd69baa3` is the persist of those #374 reviews and is the merge-base of this PR. On that merged tree, `003B-4C` is still unmarked. The implementation banner describes this unmerged candidate.
- `progress.md` records the same `PrivateNetwork=true` readback and that `003B-4C` is not marked. `RestrictAddressFamilies` and `CPUQuota` stay out. No socket family, global quota, `Ready`, or HTTP.
- `plan.md` is not in the diff. `MEDIA-NORMALIZE-003B-4C` remains `- [ ]` (line 89). `003B-4B-3`, `003B-4B-4`, and `TASK-005` remain `- [ ]`.

## Standards applied

`sdd/reviews/20261124-sol-pr374-architecture.md`: the RLIMIT cut left namespaces open, and the checkbox rule keeps `plan.md` `[ ]` until the whole `003B-4C` gate is done. This cut attests one namespace property and still leaves that checkbox open. `sdd/reviews/20261124-sol-pr366-architecture.md`: a PID 1 attest of one boundary stays inside the harness; socket family and the rest of `003B-4C` stayed open after cgroup termination. `sdd/reviews/20261122-sol-pr358-architecture.md`: one PID 1 boundary does not close `003B-4C`, `Ready`, or HTTP. `sdd/reviews/20261122-sol-pr346-architecture.md`: `CPUQuota` stays unset after PID 1 rejected it. `RestrictAddressFamilies` is that same class: PID 1 returned `ENXIO` on the previous cut, the property is not on the unit, and this cut does not put it back. Closed unit kinds stay `UnitKind` / `UnitState` / `JobState`. Android architecture standards and the Spring/Kotlin backend standards do not apply to the behavior under review: the diff has no ViewModel, UiState, controller, or Kotlin change.

## Findings

No P0. No P1. No P2. No P3.

## Residuals (not findings)

- `003B-4B-3`, `003B-4B-4`, aggregate `003B-4B`, `003B-4C`, `003B-4`, `MEDIA-NORMALIZE-004`, TASK-005, and #7 stay open. No `Ready`, no catalog HTTP, no secrets, no deploy. This review does not check off `003B-4C`, `003B-4B-3`, `003B-4B-4`, Ready, HTTP, or TASK-005.
- `RestrictAddressFamilies` stays unset after `ENXIO`. `CPUQuota` stays unset. Socket family stays out. Global quota, terminals without ACK, FD/mmap after seal, restart on every durable transition, and remaining RLIMIT stay open. This diff does not add them.
- `PrivateNetwork=true` is one network namespace. It is not the full ADR `Ready` namespace list and it is not the `AF_INET`/`AF_INET6` removal. Other namespace settings stay unset. Loopback inside that netns is still present. One `PrivateNetwork` does not close `003B-4C`.
- The PID 1 attest reads the unit property with `systemctl show`. It does not compare `/proc/<pid>/ns/net` with the host. It follows the same shape as the `LimitNOFILE` readback: a rejected start fails the harness, and a returned `Failed` state is not separately asserted before the property check. ADR-001 still wants the effective unit and the real namespace evidence before `Ready`.
- The unit test matches `PrivateNetwork` by a debug form that contains `true`. The PID 1 attest reads the effective property as `yes` or `true`. The hosted readback matched.
- `meta.md` is not in the diff and is not updated to head `bc7bf203`. The implementation banner and progress carry this cut. That matches the earlier feature cuts, which updated `meta.md` when the reviews were persisted.
- This review file is not a GitHub approval, a merge, or a `Ready` declaration, and it does not mark `003B-4C` closed.

## Conclusion

Head `bc7bf2038da15d937820ca7bd7b2e1d10996ac89` derives `PrivateNetwork=true` inside `worker_properties`. The client does not supply it. `RestrictAddressFamilies` and `CPUQuota` stay unset. The PID 1 harness starts the derived worker for job `[0xdd; 16]` and reads `PrivateNetwork` back as `yes` or `true`. That is one namespace, not the ADR `Ready` namespace or `AF_INET` list. `003B-4C`, `Ready`, and HTTP stay open. Verify `45547855613` is success 7/7 on this SHA, none cancelled, and `media-broker-pid1` `138981755632` passed `pid1_worker_private_network` (`12 passed; 0 failed`). No P0–P3. `APPROVED` for the architecture lane. This file is not a GitHub approval and does not mark `003B-4C` closed.
