VERDICT: APPROVED

## Evidence identity

- provider: xAI
- model: Grok 4.7
- effort: medium
- substitute-for: gpt-5.6-sol-medium (no quota)
- lane: architecture
- independent of the security lane. This review did not read `sdd/reviews/20261125-sol-pr401-security.md`
- PR: 401 OPEN `feat(media): attest PID 1 ProtectHostname on the worker unit` https://github.com/AgustinFalcon/storecore/pull/401
- branch: `feat/media-broker-4c-protect-hostname-20261125`
- head SHA: `80b9ff6bb3db93facccb15a3dbef8650a4dbe1ac` (`gh pr view 401` `headRefOid`; `git rev-parse HEAD`). Subject: `feat(media): attest PID 1 ProtectHostname on the worker unit`
- base / `origin/master`: `4181733b3247885ac26da5042a89c164eca0b7fa` (`gh` `baseRefOid`, `git rev-parse origin/master`, and `git merge-base origin/master HEAD`). Commit subject: `docs: persist PR 399 dual Grok reviews without closing 4C (#400)`. Persist of #400 of ProtectControlGroups #399
- one commit on the merge-base: `80b9ff6bb3db93facccb15a3dbef8650a4dbe1ac`
- diff identity: `git diff --stat 4181733b3247885ac26da5042a89c164eca0b7fa...80b9ff6bb3db93facccb15a3dbef8650a4dbe1ac` is 3 files, +100 / −9. `git diff --check` on that range exited 0 with no output
- `gh pr view 401`: `OPEN`, base `master`, head `feat/media-broker-4c-protect-hostname-20261125`. The PR body still leaves hosted Verify, the dual reviews, and the `003B-4C` / TASK-005 / HTTP close-out unchecked. This review does not edit that body and does not check those boxes
- worktree at review time was already `feat/media-broker-4c-protect-hostname-20261125` at `80b9ff6bb3db93facccb15a3dbef8650a4dbe1ac`. No checkout
- untracked persist-of-persist leftovers (`sdd/reviews/20261124-sol-pr365-*.md`, `20261124-sol-pr373-*.md`, `20261125-sol-pr376-*.md`, `20261125-sol-pr378-*.md`, `20261125-sol-pr380-*.md`, `20261125-sol-pr382-*.md`, `20261125-sol-pr384-*.md`, `20261125-sol-pr386-*.md`, `20261125-sol-pr388-*.md`, `20261125-sol-pr390-*.md`, `20261125-sol-pr392-*.md`, `20261125-sol-pr394-*.md`, `20261125-sol-pr396-*.md`, `20261125-sol-pr398-*.md`, `20261125-sol-pr400-*.md`) are outside this three-dot diff and were not staged
- local cargo: not run. This host is Windows. The new PID 1 test is `#[ignore]` and runs in `media-broker-pid1`. Focused validation is hosted Verify `45682148495`
- pre-rebase Verify `45678297698` on `ae20bd288353081f2bdff5ceed724e18bf0b802a` also completed `success` with seven `completed` / `success` jobs and none cancelled. That SHA is superseded. This review covers head `80b9ff6bb3db93facccb15a3dbef8650a4dbe1ac` only
- this file is not a GitHub approval and does not mark `003B-4C` closed

## Job conclusions (Verify 45682148495)

`gh run view 45682148495`: event `pull_request`, name `Verify`, status `completed`, conclusion `success`, headSha `80b9ff6bb3db93facccb15a3dbef8650a4dbe1ac`, `attempt` 1. `gh run list --commit 80b9ff6bb3db93facccb15a3dbef8650a4dbe1ac` returns that single Verify run. The seven jobs are all `completed` / `success`. None cancelled.

- repository-hygiene `139445180732`: `completed` / `success` (10s, `2026-11-25T19:08:12Z`–`2026-11-25T19:08:22Z`)
- unified-access-real-e2e `139445303845`: `completed` / `success` (6m36s, `2026-11-25T19:08:24Z`–`2026-11-25T19:15:00Z`)
- frontend `139445303877`: `completed` / `success` (5m58s, `2026-11-25T19:08:25Z`–`2026-11-25T19:14:23Z`)
- media-broker-pid1 `139445303902`: `completed` / `success` (23m20s, `2026-11-25T19:08:24Z`–`2026-11-25T19:31:44Z`)
- productive-routes-real-e2e `139445303908`: `completed` / `success` (7m48s, `2026-11-25T19:08:24Z`–`2026-11-25T19:16:12Z`)
- media-broker `139445304026`: `completed` / `success` (1m19s, `2026-11-25T19:08:25Z`–`2026-11-25T19:09:44Z`)
- backend `139445304355`: `completed` / `success` (10m19s, `2026-11-25T19:08:24Z`–`2026-11-25T19:18:43Z`)

`media-broker` `139445304026` records `dbus::tests::derived_worker_protect_hostname ... ok` and `test result: ok. 71 passed; 0 failed; 24 ignored`. The new PID 1 test is ignored there. `media-broker-pid1` `139445303902` records `test dbus::tests::pid1_worker_protect_hostname ... ok` and `test result: ok. 24 passed; 0 failed; 0 ignored; 0 measured; 71 filtered out`. The log filter for `ENXIO` on that job did not match.

## Diff reviewed

`git diff 4181733b3247885ac26da5042a89c164eca0b7fa...80b9ff6bb3db93facccb15a3dbef8650a4dbe1ac`: 3 files, +100 / −9. One commit:

- `80b9ff6bb3db93facccb15a3dbef8650a4dbe1ac` `feat(media): attest PID 1 ProtectHostname on the worker unit`

| File | change |
| --- | --- |
| `backend/media-broker/src/dbus.rs` | `worker_properties` gains an internal `ProtectHostname=true`. `derived_worker_protect_hostname` locks that key and the continued absence of `ProtectHome`, `RestrictAddressFamilies`, and `CPUQuota`. Ignored PID 1 test starts job `[0x1a; 16]` and reads `systemctl` `yes`/`true` |
| `sdd/STATUS.md` | implementation banner is `4C ProtectHostname del worker` and leaves `003B-4C` open. The master section stays ProtectControlGroups PR #399 |
| `sdd/wip/.../4-implementation/progress.md` | same claim; `003B-4C` is not marked |

`plan.md`, `spec.md`, `meta.md`, and ADR-001 are not in the diff. No Kotlin, Angular, workflow, migration, fixture, lockfile, HTTP route, Java pin, or secret.

## Why this cut

`003B-4C` in `plan.md` on this SHA is still `- [ ]` (line 89): harness Linux real con UID A/UID B, SELF_TEST/NORMALIZE dentro de la unidad, attestación efectiva de cgroup v2/mount/quota, aislamiento entre jobs, fallos y reinicios. The technical spec still requires SELF_TEST/NORMALIZE, isolation, per-job and global quota, terminals without ACK, FD/mmap after the seal, OOM/timeout, cgroup termination, substitution rejection, and restart on every durable transition before that gate can close. ADR-001 still withholds `Ready` until namespaces, no AF_INET/AF_INET6, `CPUQuota`, and RLIMIT are effective, and still says only `4A+4B+4C` can complete `003B-4`. `003B-4B-3`, `003B-4B-4`, `MEDIA-NORMALIZE-003B-4`, `MEDIA-NORMALIZE-004`, and `TASK-005` stay `[ ]`. `meta.md` estado remains `implementation_in_progress` and its gate paragraph still ends on PR #399 ProtectControlGroups. The functional spec is outside the diff; its catalog upload states are a separate closed set and this cut does not add media HTTP.

STATUS says this cut does not close `003B-4C`. It derives `ProtectHostname=true` and attests that PID 1 reads it. `ProtectHome`, `CPUQuota`, and `RestrictAddressFamilies` stay out. Socket family, global quota, terminals without ACK, FD/mmap, restart on each durable transition, remaining RLIMIT, and `Ready` stay absent. No media HTTP. The remaining namespaces stay out: `RestrictSUIDSGID`, `ProtectClock`, `ProtectKernelLogs`, and `ProtectKernelModules`.

The PR body matches the tree: the boolean is derived inside `worker_properties`, the client does not supply it, PID 1 reads the effective property, the three unset properties stay unset, and `003B-4C` stays open. The PR test plan leaves Verify, the dual reviews, and the close-out unchecked. This review does not check them off.

## Implementation

`ProtectHostname` is the literal `Value::from(true)` at the end of `worker_properties`, after `ProtectControlGroups`. That function takes only `&TransientUnits` and is the only worker property bag. `properties` sends it for `UnitKind::Worker` and does not send it for `UnitKind::Mount`. There is no new argument, spec field, or client property for this boolean. `UnitKind` and `UnitState` stay the closed unit types. The property is not a new string state in a view.

`derived_worker_protect_hostname` builds a spec for in-process job `[0xab; 16]` and asserts the key is present, that its debug form contains `true`, and that `ProtectHome`, `RestrictAddressFamilies`, and `CPUQuota` are absent. The worker function body confirms those three keys are not added, and confirms the four remaining namespaces named above are not added either.

`pid1_worker_protect_hostname` is ignored unless `/proc/1/comm` is `systemd` and euid is 0. It derives job `[0x1a; 16]` and principal `2102:2102`, starts the mount, writes the existing `SELF_TEST` `request.bin`, and starts the worker through PID 1. `[0x1a; 16]` is not used by another PID 1 test (`[0x19; 16]` stays on `pid1_worker_protect_control_groups`; `[0x10; 16]` through `[0x18; 16]` stay on their existing cases). If `StartTransientUnit` fails, the test panics that derived `ProtectHostname` was rejected. `systemctl show -p ProtectHostname --value` must be exactly `yes` or `true`. Stop of the worker and the mount accepts `Inactive` or `Failed`. The hosted job reached `ok`. That is a PID 1 property read after a real start, not an `ENXIO` rejection and not a worker probe that the hostname is immutable.

`ProtectHome` remains a separate earlier attest (`pid1_worker_protect_home`, job `[0x14; 16]`). This diff does not set it. The pid1 binary finished `24 passed; 0 failed`, so the previous harness cases still ran with `ProtectHostname=true` on the worker bag.

## Ledger

- `sdd/STATUS.md` banner is `4C ProtectHostname del worker`. It says this cut does not close `003B-4C`. It names derived `ProtectHostname=true` and a PID 1 read. `ProtectHome`, `CPUQuota`, and `RestrictAddressFamilies` stay out. Socket family, global quota, terminals without ACK, FD/mmap, restart, remaining RLIMIT, and `Ready` stay absent. `003B-4B-3`, `003B-4B-4`, `003B-4C`, `003B-4`, TASK-005, and #7 stay open. No media HTTP.
- The master section still records merged `866a3dfdbaede11b65d62dd4e567a29f15c0fcc2` / PR #399 and `ProtectControlGroups=true`. It does not claim this unmerged head is master and does not close `003B-4C`.
- `progress.md` records the same derivation and the same unset properties, and says `003B-4C` is not marked. No socket family, global quota, `Ready`, or media HTTP.
- `plan.md` is not in the diff. `MEDIA-NORMALIZE-003B-4C` remains `- [ ]`.

## Standards applied

`sdd/reviews/20261125-sol-pr399-architecture.md`: a PID 1 attest of one derived worker boolean stays inside the harness and leaves `003B-4C`, `Ready`, and HTTP open. `sdd/reviews/20261125-sol-pr397-architecture.md`: the same boundary for one derived boolean. `sdd/reviews/20261122-sol-pr358-architecture.md`: the same boundary for one derived limit. `sdd/reviews/20261121-sol-pr331-architecture.md`: unit properties stay internally derived. The checkbox rule recorded from `sdd/reviews/20261121-sol-pr334-architecture.md` still applies: the canonical plan checkbox stays `[ ]` until the gate is actually done. Closed unit kinds stay `UnitKind` / `UnitState`. The change stays in the media-broker D-Bus adapter; it does not cross into a Kotlin port or an HTTP controller. Android architecture standards and the Spring/Kotlin backend standards do not apply to the behavior under review: the diff has no ViewModel, UiState, controller, or Kotlin change. ADR-001 still withholds `Ready` until the full namespace, address-family, `CPUQuota`, and RLIMIT set is effective. `sdd/PATTERNS.md` still keeps domain free of framework types; this cut does not add a domain type or a wire translator.

## Findings

No P0. No P1. No P2. No P3.

## Residuals (not findings)

- `003B-4B-3`, `003B-4B-4`, aggregate `003B-4B`, `003B-4C`, `003B-4`, `MEDIA-NORMALIZE-004`, TASK-005, and #7 stay open. No `Ready`, no catalog HTTP, no secrets, no deploy. This review does not check off `003B-4C`.
- `ProtectHome` stays unset after the #389 `ENXIO`. `CPUQuota` and `RestrictAddressFamilies` stay unset. This diff does not add them.
- `RestrictSUIDSGID`, `ProtectClock`, `ProtectKernelLogs`, and `ProtectKernelModules` stay unset. This cut attests one derived boolean. It does not close `003B-4C`.
- The PID 1 attest reads `systemctl` `ProtectHostname`. It does not show that the worker process is denied a hostname change. That behavioral probe remains part of the open `003B-4C` harness.
- `meta.md` is outside the diff and still ends on the persisted #399 gate. It does not name head `80b9ff6bb3db93facccb15a3dbef8650a4dbe1ac`. The implementation banner and progress carry this cut.
- Pre-rebase Verify `45678297698` on `ae20bd288353081f2bdff5ceed724e18bf0b802a` is superseded and is not evidence for this head.
- This review file is not a GitHub approval, a merge, or a `Ready` declaration, and it does not mark `003B-4C` closed.

## Conclusion

Head `80b9ff6bb3db93facccb15a3dbef8650a4dbe1ac` derives `ProtectHostname=true` inside `worker_properties` and attests, on PID 1, that job `[0x1a; 16]` starts and `systemctl` reports `ProtectHostname` as `yes` or `true`. `ProtectHome`, `CPUQuota`, and `RestrictAddressFamilies` stay unset. Verify `45682148495` is success 7/7 on this SHA, attempt 1, none cancelled. `media-broker-pid1` `139445303902` records `pid1_worker_protect_hostname ... ok` (`24 passed; 0 failed`). `media-broker` `139445304026` passed `derived_worker_protect_hostname` (`71 passed; 0 failed; 24 ignored`). `003B-4C`, `Ready`, HTTP, `003B-4B-3`, `003B-4B-4`, and TASK-005 stay open. The remaining namespaces stay out. No inject-ready claim. No P0–P3. `APPROVED` for the architecture lane. This file is not a GitHub approval and does not mark `003B-4C` closed.
