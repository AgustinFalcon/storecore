VERDICT: APPROVED

## Evidence identity

- provider: xAI
- model: Grok 4.7
- effort: medium
- substitute-for: gpt-5.6-sol-medium (no quota)
- lane: architecture
- independent of the security lane. This review did not read `sdd/reviews/20261125-sol-pr391-security.md`
- PR: 391 OPEN `feat(media): attest PID 1 PrivateDevices on the worker unit` https://github.com/AgustinFalcon/storecore/pull/391
- branch: `feat/media-broker-4c-private-devices-20261125`
- head SHA: `d9d191399590618d45df860b6b8ea7b2605c1d4f` (`gh pr view 391` `headRefOid`; `git rev-parse HEAD`). Subject: `feat(media): attest PID 1 PrivateDevices on the worker unit`
- base / `origin/master`: `0142ffdcd43fd78125f33911813d2ccb45d79638` (`gh` `baseRefOid`, `git rev-parse origin/master`, and `git merge-base origin/master HEAD`). Persist of #390 of ProtectHome ENXIO #389
- one commit on the merge-base: `d9d191399590618d45df860b6b8ea7b2605c1d4f`
- diff identity: `git diff --stat origin/master...HEAD` is 3 files, +100 / −8. `git diff --check origin/master...HEAD` exit 0
- `gh pr view 391`: `OPEN`, base `master`, head `feat/media-broker-4c-private-devices-20261125`. The PR body still leaves hosted Verify, the dual reviews, and the `003B-4C` / TASK-005 / HTTP close-out unchecked. This review does not edit that body and does not check those boxes
- worktree at review time was already `feat/media-broker-4c-private-devices-20261125` at `d9d191399590618d45df860b6b8ea7b2605c1d4f`. No checkout
- untracked persist-of-persist leftovers (`sdd/reviews/20261124-sol-pr365-*.md`, `20261124-sol-pr373-*.md`, `20261125-sol-pr376-*.md`, `20261125-sol-pr378-*.md`, `20261125-sol-pr380-*.md`, `20261125-sol-pr382-*.md`, `20261125-sol-pr384-*.md`, `20261125-sol-pr386-*.md`, `20261125-sol-pr388-*.md`, `20261125-sol-pr390-*.md`) are outside this three-dot diff and were not staged
- this file is not a GitHub approval and does not mark `003B-4C` closed

## Job conclusions (Verify 45635171309)

`gh pr checks 391` and `gh run view 45635171309`: event `pull_request`, name `Verify`, status `completed`, conclusion `success`, headSha `d9d191399590618d45df860b6b8ea7b2605c1d4f`. `gh run list --commit d9d191399590618d45df860b6b8ea7b2605c1d4f` returns that single Verify run. Seven jobs, all `completed` / `success`. None cancelled.

- repository-hygiene `139278550958`: `completed` / `success`
- backend `139278660761`: `completed` / `success`
- media-broker `139278661201`: `completed` / `success`
- media-broker-pid1 `139278660974`: `completed` / `success`
- frontend `139278660739`: `completed` / `success`
- productive-routes-real-e2e `139278724924`: `completed` / `success`
- unified-access-real-e2e `139278660571`: `completed` / `success`

`media-broker` `139278661201` records `dbus::tests::derived_worker_private_devices ... ok` and `test result: ok. 66 passed; 0 failed; 19 ignored`. `media-broker-pid1` `139278660974` records `dbus::tests::pid1_worker_private_devices ... ok` and `dbus::tests::pid1_worker_protect_home ... ok`, then `test result: ok. 19 passed; 0 failed; 0 ignored; 0 measured; 66 filtered out`.

The PR body still leaves the hosted-Verify checkbox open. This review records the run and does not edit that body.

## Diff reviewed

`git diff origin/master...HEAD`: 3 files, +100 / −8. One commit. No Kotlin, Angular, workflow, migration, fixture, lockfile, HTTP route, or secret. `plan.md`, `spec.md`, `meta.md`, and ADR-001 are not in the diff.

| File | change |
| --- | --- |
| `backend/media-broker/src/dbus.rs` | `worker_properties` gains `PrivateDevices=true`. `derived_worker_private_devices` locks that value and the absence of `ProtectHome`, `RestrictAddressFamilies`, and `CPUQuota`. Ignored PID 1 test `pid1_worker_private_devices` uses `JobId` `[0x15; 16]`, starts the worker, and reads `PrivateDevices` back as `yes` or `true` |
| `sdd/STATUS.md` | Implementation banner becomes “4C PrivateDevices del worker”. It says this cut does not close `003B-4C`. The master section still records ProtectHome ENXIO #389 and is not rewritten into a close-out |
| `sdd/wip/.../4-implementation/progress.md` | One start entry. Derives `PrivateDevices=true`, leaves `ProtectHome` / `CPUQuota` / `RestrictAddressFamilies` out, and does not mark `003B-4C`. No socket family, global quota, `Ready`, or media HTTP |

## Why this cut

`003B-4C` in `plan.md` on this SHA is still `- [ ]` (line 89): harness Linux real con UID A/UID B, SELF_TEST/NORMALIZE dentro de la unidad, attestación efectiva de cgroup v2/mount/quota, aislamiento entre jobs, fallos y reinicios. ADR-001 still requires namespaces, no AF_INET/AF_INET6, `CPUQuota`, RLIMIT, and SELF_TEST `Matched` inside the unit before `Ready`, and still says only `4A+4B+4C` can complete `003B-4`. `003B-4B-3` (line 84), `003B-4B-4` (line 87), `MEDIA-NORMALIZE-004` (line 93), and `TASK-005` (line 16) stay `- [ ]`. The plan still says none of those cuts enable HTTP, a live provider, secrets, deploy, or homologation.

STATUS says this cut does not close `003B-4C`. It derives `PrivateDevices=true` and says PID 1 reads it. `ProtectHome`, `CPUQuota`, and `RestrictAddressFamilies` stay out. Socket family, global quota, terminals without ACK, FD/mmap after seal, restart on every durable transition, remaining RLIMIT, and `Ready` stay absent. No media HTTP.

The PR body matches the tree: `PrivateDevices=true` is derived inside `worker_properties`, the client does not supply it, PID 1 reads the property back, `ProtectHome` / `CPUQuota` / `RestrictAddressFamilies` stay unset, and `003B-4C` stays open. The PR test plan leaves Verify, the dual reviews, and the `003B-4C` checkbox unchecked. This review does not check them off.

## Implementation

`("PrivateDevices", Value::from(true))` is a crate-owned entry at the end of `worker_properties`. `start_transient` sends that bag through `properties(UnitKind::Worker)`. There is no client argument for the boolean. `ProtectHome`, `CPUQuota`, and `RestrictAddressFamilies` are absent from the vec. `PrivateNetwork=true` and `PrivateTmp=true` stay as they were.

`derived_worker_private_devices` builds the bag for job `[0xab; 16]` and asserts the key is present, the `Value` debug form contains `true`, and the three unset keys are absent.

`pid1_worker_private_devices` is ignored unless `/proc/1/comm` is `systemd` and euid is 0. It derives job `[0x15; 16]` and principal `2102:2102`, starts the mount, writes the existing `SELF_TEST` `request.bin`, and starts the worker through PID 1. Failure panics with `StartTransientUnit rejected derived PrivateDevices`. `systemctl` `PrivateDevices` must be `yes` or `true`. Stop of the worker and the mount accepts `Inactive` or `Failed`.

That PID 1 test does not itself read `ProtectHome`. Unset `ProtectHome` stays a separate attest: `derived_worker_protect_home` and `derived_worker_private_devices` reject the key, and `pid1_worker_protect_home` (job `[0x14; 16]`) still requires `systemctl` `ProtectHome` to be `no`, `false`, or empty. The same pid1 job passed that test after this change.

`UnitKind` / `UnitState` stay the closed unit types. `PrivateDevices` is a derived property, not a new string state in a view.

## Ledger

- `sdd/STATUS.md` banner is `4C PrivateDevices del worker`. It says this cut does not close `003B-4C`. It names derived `PrivateDevices=true` and a PID 1 read. `ProtectHome`, `CPUQuota`, and `RestrictAddressFamilies` stay out. Socket family, global quota, terminals without ACK, FD/mmap, restart, remaining RLIMIT, and `Ready` stay absent. `003B-4B-3`, `003B-4B-4`, `003B-4C`, `003B-4`, TASK-005, and #7 stay open. No media HTTP.
- The master section still records merged `d6d1f9399504dbe150e9e5447e2696e9159a1247` / PR #389 and ProtectHome left out for `ENXIO`. It does not claim this unmerged head is master and does not close `003B-4C`.
- `progress.md` records the same derivation and the same unset properties, and says `003B-4C` is not marked. No socket family, global quota, `Ready`, or media HTTP.
- `plan.md` is not in the diff. `MEDIA-NORMALIZE-003B-4C` remains `- [ ]`.

## Standards applied

`sdd/reviews/20261122-sol-pr358-architecture.md`: a PID 1 attest of one derived worker property stays inside the harness and leaves `003B-4C`, `Ready`, and HTTP open. `sdd/reviews/20261121-sol-pr331-architecture.md`: unit properties stay internally derived. The checkbox rule recorded from `sdd/reviews/20261121-sol-pr334-architecture.md` still applies: the canonical plan checkbox stays `[ ]` until the gate is actually done. Closed unit kinds stay `UnitKind` / `UnitState`. Android architecture standards and the Spring/Kotlin backend standards do not apply to the behavior under review: the diff has no ViewModel, UiState, controller, or Kotlin change. ADR-001 still withholds `Ready` until the full namespace, address-family, `CPUQuota`, and RLIMIT set is effective.

## Findings

No P0. No P1. No P2. No P3.

## Residuals (not findings)

- `003B-4B-3`, `003B-4B-4`, aggregate `003B-4B`, `003B-4C`, `003B-4`, `MEDIA-NORMALIZE-004`, TASK-005, and #7 stay open. No `Ready`, no catalog HTTP, no secrets, no deploy. This review does not check off `003B-4C`.
- `ProtectHome` stays unset after the #389 `ENXIO`. `CPUQuota` and `RestrictAddressFamilies` stay unset. This diff does not add them.
- The PID 1 attest reads `systemctl` `PrivateDevices`. It does not probe `/dev` nodes, device cgroup access, or a substituted device path. Effective device isolation remains part of the open `003B-4C` harness.
- `pid1_worker_private_devices` does not re-read `ProtectHome`. The separate `pid1_worker_protect_home` test still does, and it passed on this Verify run.
- `meta.md` is outside the diff and still ends on the persisted #389 gate. It does not name head `d9d191399590618d45df860b6b8ea7b2605c1d4f`. The implementation banner and progress carry this cut.
- This review file is not a GitHub approval, a merge, or a `Ready` declaration, and it does not mark `003B-4C` closed.

## Conclusion

Head `d9d191399590618d45df860b6b8ea7b2605c1d4f` derives `PrivateDevices=true` inside `worker_properties` and attests, on PID 1, that job `[0x15; 16]` starts and `systemctl` reports `PrivateDevices` as `yes` or `true`. `ProtectHome`, `CPUQuota`, and `RestrictAddressFamilies` stay unset. `ProtectHome` remains a separate systemctl attest on job `[0x14; 16]`. Verify `45635171309` is success 7/7 on this SHA, none cancelled. `media-broker` `139278661201` passed `derived_worker_private_devices` (`66 passed; 0 failed; 19 ignored`). `media-broker-pid1` `139278660974` passed `pid1_worker_private_devices` and `pid1_worker_protect_home` (`19 passed; 0 failed`). `003B-4C`, `Ready`, HTTP, `003B-4B-3`, `003B-4B-4`, and TASK-005 stay open. No inject-ready claim. No P0–P3. `APPROVED` for the architecture lane. This file is not a GitHub approval and does not mark `003B-4C` closed.
