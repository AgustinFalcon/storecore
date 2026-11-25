VERDICT: APPROVED

## Evidence identity

- provider: xAI
- model: Grok 4.7
- effort: medium
- substitute-for: gpt-5.6-sol-medium (no quota)
- lane: architecture
- independent of the security lane. This review did not read `sdd/reviews/20261125-sol-pr393-security.md`
- PR: 393 OPEN `feat(media): attest PID 1 RestrictRealtime on the worker unit` https://github.com/AgustinFalcon/storecore/pull/393
- branch: `feat/media-broker-4c-restrict-realtime-20261125`
- head SHA: `8c006b51f6baaed3d0b0c4193629621f1727c403` (`gh pr view 393` `headRefOid`; `git rev-parse HEAD`). Subject: `feat(media): attest PID 1 RestrictRealtime on the worker unit`
- base / `origin/master`: `57ee9b87218fbed2be65a174e74aef4f3ccfc97e` (`gh` `baseRefOid`, `git rev-parse origin/master`, and `git merge-base origin/master HEAD`). Commit subject: `docs: persist PR 391 dual Grok reviews without closing 4C (#392)`. Persist of #392 of PrivateDevices #391
- one commit on the merge-base: `8c006b51f6baaed3d0b0c4193629621f1727c403`
- diff identity: `git diff --stat 57ee9b87218fbed2be65a174e74aef4f3ccfc97e...8c006b51f6baaed3d0b0c4193629621f1727c403` is 3 files, +100 / −8. `git diff --check` on that range exited 0 with no output
- `gh pr view 393`: `OPEN`, base `master`, head `feat/media-broker-4c-restrict-realtime-20261125`. The PR body still leaves hosted Verify, the dual reviews, and the `003B-4C` / TASK-005 / HTTP close-out unchecked. This review does not edit that body and does not check those boxes
- worktree at review time was already `feat/media-broker-4c-restrict-realtime-20261125` at `8c006b51f6baaed3d0b0c4193629621f1727c403`. No checkout
- untracked persist-of-persist leftovers (`sdd/reviews/20261124-sol-pr365-*.md`, `20261124-sol-pr373-*.md`, `20261125-sol-pr376-*.md`, `20261125-sol-pr378-*.md`, `20261125-sol-pr380-*.md`, `20261125-sol-pr382-*.md`, `20261125-sol-pr384-*.md`, `20261125-sol-pr386-*.md`, `20261125-sol-pr388-*.md`, `20261125-sol-pr390-*.md`, `20261125-sol-pr392-*.md`) are outside this three-dot diff and were not staged
- local cargo: not run. This host is Windows. The new PID 1 test is `#[ignore]` and runs in `media-broker-pid1`. Focused validation is hosted Verify `45643109921`
- this file is not a GitHub approval and does not mark `003B-4C` closed

## Job conclusions (Verify 45643109921)

`gh pr checks 393` and `gh run view 45643109921`: event `pull_request`, name `Verify`, status `completed`, conclusion `success`, headSha `8c006b51f6baaed3d0b0c4193629621f1727c403`, `run_attempt` 2. `gh run list --commit 8c006b51f6baaed3d0b0c4193629621f1727c403` returns that single Verify run. The current seven jobs are all `completed` / `success`. None cancelled.

- repository-hygiene `139320163409`: `completed` / `success`
- backend `139320270013`: `completed` / `success`
- media-broker `139320269997`: `completed` / `success`
- media-broker-pid1 `139320248551`: `completed` / `success`
- frontend `139320225268`: `completed` / `success`
- productive-routes-real-e2e `139320164567`: `completed` / `success`
- unified-access-real-e2e `139320160318`: `completed` / `success`

Attempt 1 of the same run had six successes and one failure. `unified-access-real-e2e` `139306933685` failed at setup-java: `No matching version found for SemVer '21.0.13+9'`. The catalog line includes `21.0.13+9.0.LTS`. That job was rerun as `139320160318` and passed. `media-broker-pid1` attempt 1 `139306933620` was already `success`, started `2026-11-25T15:15:48Z` and completed `2026-11-25T15:34:54Z`. The post-rerun id `139320248551` has those same timestamps, so it is the first execution recorded again on attempt 2, not a second PID 1 run and not a `RestrictRealtime` `ENXIO`. The Temurin miss is infrastructure. It does not close a capability.

`media-broker` `139320269997` records `dbus::tests::derived_worker_restrict_realtime ... ok` and `test result: ok. 67 passed; 0 failed; 20 ignored`. The new PID 1 test is ignored there. `media-broker-pid1` `139320248551` records `test dbus::tests::pid1_worker_restrict_realtime ... ok` and `test result: ok. 20 passed; 0 failed; 0 ignored; 0 measured; 67 filtered out`. The log filter for `ENXIO` on that job did not match.

## Diff reviewed

`git diff 57ee9b87218fbed2be65a174e74aef4f3ccfc97e...8c006b51f6baaed3d0b0c4193629621f1727c403`: 3 files, +100 / −8. One commit:

- `8c006b51f6baaed3d0b0c4193629621f1727c403` `feat(media): attest PID 1 RestrictRealtime on the worker unit`

| File | change |
| --- | --- |
| `backend/media-broker/src/dbus.rs` | `worker_properties` gains an internal `RestrictRealtime=true`. `derived_worker_restrict_realtime` locks that key and the continued absence of `ProtectHome`, `RestrictAddressFamilies`, and `CPUQuota`. Ignored PID 1 test starts job `[0x16; 16]` and reads `systemctl` `yes`/`true` |
| `sdd/STATUS.md` | implementation banner names the derivation and the PID 1 read, and leaves `003B-4C` open. The master section stays PrivateDevices PR #391 |
| `sdd/wip/.../4-implementation/progress.md` | same claim; `003B-4C` is not marked |

`plan.md`, `spec.md`, `meta.md`, and ADR-001 are not in the diff. No Kotlin, Angular, workflow, migration, fixture, lockfile, HTTP route, or secret.

## Why this cut

`003B-4C` in `plan.md` on this SHA is still `- [ ]` (line 89): harness Linux real con UID A/UID B, SELF_TEST/NORMALIZE dentro de la unidad, attestación efectiva de cgroup v2/mount/quota, aislamiento entre jobs, fallos y reinicios. The spec still requires SELF_TEST/NORMALIZE, isolation, per-job and global quota, terminals without ACK, FD/mmap after the seal, OOM/timeout, cgroup termination, substitution rejection, and restart on every durable transition before that gate can close. ADR-001 still withholds `Ready` until namespaces, no AF_INET/AF_INET6, `CPUQuota`, and RLIMIT are effective, and still says only `4A+4B+4C` can complete `003B-4`. `003B-4B-3`, `003B-4B-4`, `MEDIA-NORMALIZE-003B-4`, `MEDIA-NORMALIZE-004`, and `TASK-005` stay `[ ]`. `meta.md` estado remains `implementation_in_progress` and its gate paragraph still ends on PR #391 PrivateDevices.

STATUS says this cut does not close `003B-4C`. It derives `RestrictRealtime=true` and attests that PID 1 reads it. `ProtectHome`, `CPUQuota`, and `RestrictAddressFamilies` stay out. Socket family, global quota, terminals without ACK, FD/mmap, restart on each durable transition, remaining RLIMIT, and `Ready` stay absent. No media HTTP.

The PR body matches the tree: the boolean is derived inside `worker_properties`, the client does not supply it, PID 1 reads the effective property, the three unset properties stay unset, and `003B-4C` stays open. The PR test plan leaves Verify, the dual reviews, and the close-out unchecked. This review does not check them off.

## Implementation

`RestrictRealtime` is the literal `Value::from(true)` at the end of `worker_properties`. That function is the only worker property bag. `properties` sends it for `UnitKind::Worker` and does not send it for `UnitKind::Mount`. There is no new argument, spec field, or client property for this boolean. `UnitKind` and `UnitState` stay the closed unit types. The property is not a new string state in a view.

`derived_worker_restrict_realtime` builds a spec for in-process job `[0xab; 16]` and asserts the key is present, that its debug form contains `true`, and that `ProtectHome`, `RestrictAddressFamilies`, and `CPUQuota` are absent. The worker function body confirms those three keys are not added.

`pid1_worker_restrict_realtime` is ignored unless `/proc/1/comm` is `systemd` and euid is 0. It derives job `[0x16; 16]` and principal `2102:2102`, starts the mount, writes the existing `SELF_TEST` `request.bin`, and starts the worker through PID 1. `[0x16; 16]` is not used by another PID 1 test. If `StartTransientUnit` fails, the test panics that derived `RestrictRealtime` was rejected. `systemctl show -p RestrictRealtime --value` must be exactly `yes` or `true`. Stop of the worker and the mount accepts `Inactive` or `Failed`. The hosted job reached `ok`. That is a PID 1 property read after a real start, not an `ENXIO` rejection and not a worker `sched_setscheduler` probe.

`ProtectHome` remains a separate earlier attest (`pid1_worker_protect_home`, job `[0x14; 16]`). This diff does not set it. The pid1 binary finished `20 passed; 0 failed`, so the previous harness cases still ran with `RestrictRealtime=true` on the worker bag.

## Ledger

- `sdd/STATUS.md` banner is `4C RestrictRealtime del worker`. It says this cut does not close `003B-4C`. It names derived `RestrictRealtime=true` and a PID 1 read. `ProtectHome`, `CPUQuota`, and `RestrictAddressFamilies` stay out. Socket family, global quota, terminals without ACK, FD/mmap, restart, remaining RLIMIT, and `Ready` stay absent. `003B-4B-3`, `003B-4B-4`, `003B-4C`, `003B-4`, TASK-005, and #7 stay open. No media HTTP.
- The master section still records merged `5f77f39d741786ad82451528b2cc0ea24323252b` / PR #391 and `PrivateDevices=true`. It does not claim this unmerged head is master and does not close `003B-4C`.
- `progress.md` records the same derivation and the same unset properties, and says `003B-4C` is not marked. No socket family, global quota, `Ready`, or media HTTP.
- `plan.md` is not in the diff. `MEDIA-NORMALIZE-003B-4C` remains `- [ ]`.

## Standards applied

`sdd/reviews/20261125-sol-pr391-architecture.md`: a PID 1 attest of one derived worker boolean stays inside the harness and leaves `003B-4C`, `Ready`, and HTTP open. `sdd/reviews/20261122-sol-pr358-architecture.md`: the same boundary for one derived limit. `sdd/reviews/20261121-sol-pr331-architecture.md`: unit properties stay internally derived. The checkbox rule recorded from `sdd/reviews/20261121-sol-pr334-architecture.md` still applies: the canonical plan checkbox stays `[ ]` until the gate is actually done. Closed unit kinds stay `UnitKind` / `UnitState`. Android architecture standards and the Spring/Kotlin backend standards do not apply to the behavior under review: the diff has no ViewModel, UiState, controller, or Kotlin change. ADR-001 still withholds `Ready` until the full namespace, address-family, `CPUQuota`, and RLIMIT set is effective.

## Findings

No P0. No P1. No P2. No P3.

## Residuals (not findings)

- `003B-4B-3`, `003B-4B-4`, aggregate `003B-4B`, `003B-4C`, `003B-4`, `MEDIA-NORMALIZE-004`, TASK-005, and #7 stay open. No `Ready`, no catalog HTTP, no secrets, no deploy. This review does not check off `003B-4C`.
- `ProtectHome` stays unset after the #389 `ENXIO`. `CPUQuota` and `RestrictAddressFamilies` stay unset. This diff does not add them.
- The PID 1 attest reads `systemctl` `RestrictRealtime`. It does not call `sched_setscheduler` or otherwise show that the worker process is denied a realtime policy. That behavioral probe remains part of the open `003B-4C` harness.
- `meta.md` is outside the diff and still ends on the persisted #391 gate. It does not name head `8c006b51f6baaed3d0b0c4193629621f1727c403`. The implementation banner and progress carry this cut.
- The Adoptium SemVer miss on the first `unified-access-real-e2e` is not a sandbox result and does not close `003B-4C`.
- This review file is not a GitHub approval, a merge, or a `Ready` declaration, and it does not mark `003B-4C` closed.

## Conclusion

Head `8c006b51f6baaed3d0b0c4193629621f1727c403` derives `RestrictRealtime=true` inside `worker_properties` and attests, on PID 1, that job `[0x16; 16]` starts and `systemctl` reports `RestrictRealtime` as `yes` or `true`. `ProtectHome`, `CPUQuota`, and `RestrictAddressFamilies` stay unset. Verify `45643109921` is success 7/7 on this SHA, none cancelled. The only failure on the run was attempt-1 `unified-access-real-e2e` `139306933685` (Adoptium had no SemVer `21.0.13+9`; the catalog offered `21.0.13+9.0.LTS`). Rerun `139320160318` passed. `media-broker-pid1` passed on the first attempt (`139306933620`, recorded after the rerun as `139320248551`) with `pid1_worker_restrict_realtime ... ok`. `media-broker` `139320269997` passed `derived_worker_restrict_realtime` (`67 passed; 0 failed; 20 ignored`). `003B-4C`, `Ready`, HTTP, `003B-4B-3`, `003B-4B-4`, and TASK-005 stay open. No inject-ready claim. No P0–P3. `APPROVED` for the architecture lane. This file is not a GitHub approval and does not mark `003B-4C` closed.
