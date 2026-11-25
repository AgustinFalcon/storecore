VERDICT: APPROVED

## Evidence identity

- provider: xAI
- model: Grok 4.7
- effort: medium
- substitute-for: gpt-5.6-sol-medium (no quota)
- lane: architecture
- independent of the security lane. This review did not read `sdd/reviews/20261125-sol-pr399-security.md`
- PR: 399 OPEN `feat(media): attest PID 1 ProtectControlGroups on the worker unit` https://github.com/AgustinFalcon/storecore/pull/399
- branch: `feat/media-broker-4c-protect-control-groups-20261125`
- head SHA: `b8ab5a36848c33ff7834ecd9637c85d9f4b6cb61` (`gh pr view 399` `headRefOid`; `git rev-parse HEAD`). Subject: `feat(media): attest PID 1 ProtectControlGroups on the worker unit`
- base / `origin/master`: `b0a08a141e3b9c4067faa98949132a479f539d72` (`gh` `baseRefOid`, `git rev-parse origin/master`, and `git merge-base origin/master HEAD`). Commit subject: `docs: persist PR 397 dual Grok reviews without closing 4C (#398)`. Persist of #398 of ProtectKernelTunables #397
- one commit on the merge-base: `b8ab5a36848c33ff7834ecd9637c85d9f4b6cb61`
- diff identity: `git diff --stat b0a08a141e3b9c4067faa98949132a479f539d72...b8ab5a36848c33ff7834ecd9637c85d9f4b6cb61` is 3 files, +101 / −9. `git diff --check` on that range exited 0 with no output
- `gh pr view 399`: `OPEN`, base `master`, head `feat/media-broker-4c-protect-control-groups-20261125`. The PR body still leaves hosted Verify, the dual reviews, and the `003B-4C` / TASK-005 / HTTP close-out unchecked. This review does not edit that body and does not check those boxes
- worktree at review time was already `feat/media-broker-4c-protect-control-groups-20261125` at `b8ab5a36848c33ff7834ecd9637c85d9f4b6cb61`. No checkout
- untracked persist-of-persist leftovers (`sdd/reviews/20261124-sol-pr365-*.md`, `20261124-sol-pr373-*.md`, `20261125-sol-pr376-*.md`, `20261125-sol-pr378-*.md`, `20261125-sol-pr380-*.md`, `20261125-sol-pr382-*.md`, `20261125-sol-pr384-*.md`, `20261125-sol-pr386-*.md`, `20261125-sol-pr388-*.md`, `20261125-sol-pr390-*.md`, `20261125-sol-pr392-*.md`, `20261125-sol-pr394-*.md`, `20261125-sol-pr396-*.md`, `20261125-sol-pr398-*.md`) are outside this three-dot diff and were not staged
- local cargo: not run. This host is Windows. The new PID 1 test is `#[ignore]` and runs in `media-broker-pid1`. Focused validation is hosted Verify `45674345804`
- pre-rebase Verify `45665729714` on `6937daf287f266912b811970a1adf777938253e5` also completed `success` with seven `completed` / `success` jobs and none cancelled. That SHA is superseded. This review covers head `b8ab5a36848c33ff7834ecd9637c85d9f4b6cb61` only
- this file is not a GitHub approval and does not mark `003B-4C` closed

## Job conclusions (Verify 45674345804)

`gh run view 45674345804`: event `pull_request`, name `Verify`, status `completed`, conclusion `success`, headSha `b8ab5a36848c33ff7834ecd9637c85d9f4b6cb61`, `attempt` 1. `gh run list --commit b8ab5a36848c33ff7834ecd9637c85d9f4b6cb61` returns that single Verify run. The seven jobs are all `completed` / `success`. None cancelled.

- repository-hygiene `139417746801`: `completed` / `success` (10s, `2026-11-25T18:21:43Z`–`2026-11-25T18:21:53Z`)
- productive-routes-real-e2e `139417866814`: `completed` / `success` (8m35s, `2026-11-25T18:21:55Z`–`2026-11-25T18:30:30Z`)
- media-broker-pid1 `139417866865`: `completed` / `success` (19m49s, `2026-11-25T18:21:55Z`–`2026-11-25T18:41:44Z`)
- unified-access-real-e2e `139417866909`: `completed` / `success` (9m13s, `2026-11-25T18:21:55Z`–`2026-11-25T18:31:08Z`)
- backend `139417867032`: `completed` / `success` (11m48s, `2026-11-25T18:21:55Z`–`2026-11-25T18:33:43Z`)
- media-broker `139417867087`: `completed` / `success` (1m17s, `2026-11-25T18:21:55Z`–`2026-11-25T18:23:12Z`)
- frontend `139417867125`: `completed` / `success` (6m33s, `2026-11-25T18:21:55Z`–`2026-11-25T18:28:28Z`)

`media-broker` `139417867087` records `dbus::tests::derived_worker_protect_control_groups ... ok` and `test result: ok. 70 passed; 0 failed; 23 ignored`. The new PID 1 test is ignored there. `media-broker-pid1` `139417866865` records `test dbus::tests::pid1_worker_protect_control_groups ... ok` and `test result: ok. 23 passed; 0 failed; 0 ignored; 0 measured; 70 filtered out`. The log filter for `ENXIO` on that job did not match.

## Diff reviewed

`git diff b0a08a141e3b9c4067faa98949132a479f539d72...b8ab5a36848c33ff7834ecd9637c85d9f4b6cb61`: 3 files, +101 / −9. One commit:

- `b8ab5a36848c33ff7834ecd9637c85d9f4b6cb61` `feat(media): attest PID 1 ProtectControlGroups on the worker unit`

| File | change |
| --- | --- |
| `backend/media-broker/src/dbus.rs` | `worker_properties` gains an internal `ProtectControlGroups=true`. `derived_worker_protect_control_groups` locks that key and the continued absence of `ProtectHome`, `RestrictAddressFamilies`, and `CPUQuota`. Ignored PID 1 test starts job `[0x19; 16]` and reads `systemctl` `yes`/`true` |
| `sdd/STATUS.md` | implementation banner is `4C ProtectControlGroups del worker` and leaves `003B-4C` open. The master section stays ProtectKernelTunables PR #397 |
| `sdd/wip/.../4-implementation/progress.md` | same claim; `003B-4C` is not marked |

`plan.md`, `spec.md`, `meta.md`, and ADR-001 are not in the diff. No Kotlin, Angular, workflow, migration, fixture, lockfile, HTTP route, Java pin, or secret.

## Why this cut

`003B-4C` in `plan.md` on this SHA is still `- [ ]` (line 89): harness Linux real con UID A/UID B, SELF_TEST/NORMALIZE dentro de la unidad, attestación efectiva de cgroup v2/mount/quota, aislamiento entre jobs, fallos y reinicios. The technical spec still requires SELF_TEST/NORMALIZE, isolation, per-job and global quota, terminals without ACK, FD/mmap after the seal, OOM/timeout, cgroup termination, substitution rejection, and restart on every durable transition before that gate can close. ADR-001 still withholds `Ready` until namespaces, no AF_INET/AF_INET6, `CPUQuota`, and RLIMIT are effective, and still says only `4A+4B+4C` can complete `003B-4`. `003B-4B-3`, `003B-4B-4`, `MEDIA-NORMALIZE-003B-4`, `MEDIA-NORMALIZE-004`, and `TASK-005` stay `[ ]`. `meta.md` estado remains `implementation_in_progress` and its gate paragraph still ends on PR #397 ProtectKernelTunables. The functional spec is outside the diff; its catalog upload states are a separate closed set and this cut does not add media HTTP.

STATUS says this cut does not close `003B-4C`. It derives `ProtectControlGroups=true` and attests that PID 1 reads it. `ProtectHome`, `CPUQuota`, and `RestrictAddressFamilies` stay out. Socket family, global quota, terminals without ACK, FD/mmap, restart on each durable transition, remaining RLIMIT, and `Ready` stay absent. No media HTTP. The remaining namespaces stay out: `ProtectHostname`, `RestrictSUIDSGID`, `ProtectClock`, `ProtectKernelLogs`, and `ProtectKernelModules`.

The PR body matches the tree: the boolean is derived inside `worker_properties`, the client does not supply it, PID 1 reads the effective property, the three unset properties stay unset, and `003B-4C` stays open. The PR test plan leaves Verify, the dual reviews, and the close-out unchecked. This review does not check them off.

## Implementation

`ProtectControlGroups` is the literal `Value::from(true)` at the end of `worker_properties`, after `ProtectKernelTunables`. That function takes only `&TransientUnits` and is the only worker property bag. `properties` sends it for `UnitKind::Worker` and does not send it for `UnitKind::Mount`. There is no new argument, spec field, or client property for this boolean. `UnitKind` and `UnitState` stay the closed unit types. The property is not a new string state in a view.

`derived_worker_protect_control_groups` builds a spec for in-process job `[0xab; 16]` and asserts the key is present, that its debug form contains `true`, and that `ProtectHome`, `RestrictAddressFamilies`, and `CPUQuota` are absent. The worker function body confirms those three keys are not added, and confirms the five remaining namespaces named above are not added either.

`pid1_worker_protect_control_groups` is ignored unless `/proc/1/comm` is `systemd` and euid is 0. It derives job `[0x19; 16]` and principal `2102:2102`, starts the mount, writes the existing `SELF_TEST` `request.bin`, and starts the worker through PID 1. `[0x19; 16]` is not used by another PID 1 test (`[0x10; 16]` through `[0x18; 16]` stay on their existing cases). If `StartTransientUnit` fails, the test panics that derived `ProtectControlGroups` was rejected. `systemctl show -p ProtectControlGroups --value` must be exactly `yes` or `true`. Stop of the worker and the mount accepts `Inactive` or `Failed`. The hosted job reached `ok`. That is a PID 1 property read after a real start, not an `ENXIO` rejection and not a worker probe of cgroup writability.

`ProtectHome` remains a separate earlier attest (`pid1_worker_protect_home`, job `[0x14; 16]`). This diff does not set it. The pid1 binary finished `23 passed; 0 failed`, so the previous harness cases still ran with `ProtectControlGroups=true` on the worker bag.

## Ledger

- `sdd/STATUS.md` banner is `4C ProtectControlGroups del worker`. It says this cut does not close `003B-4C`. It names derived `ProtectControlGroups=true` and a PID 1 read. `ProtectHome`, `CPUQuota`, and `RestrictAddressFamilies` stay out. Socket family, global quota, terminals without ACK, FD/mmap, restart, remaining RLIMIT, and `Ready` stay absent. `003B-4B-3`, `003B-4B-4`, `003B-4C`, `003B-4`, TASK-005, and #7 stay open. No media HTTP.
- The master section still records merged `1fad60f03fc1a17788281cce2c42d5dbe79cbf30` / PR #397 and `ProtectKernelTunables=true`. It does not claim this unmerged head is master and does not close `003B-4C`.
- `progress.md` records the same derivation and the same unset properties, and says `003B-4C` is not marked. No socket family, global quota, `Ready`, or media HTTP.
- `plan.md` is not in the diff. `MEDIA-NORMALIZE-003B-4C` remains `- [ ]`.

## Standards applied

`sdd/reviews/20261125-sol-pr397-architecture.md`: a PID 1 attest of one derived worker boolean stays inside the harness and leaves `003B-4C`, `Ready`, and HTTP open. `sdd/reviews/20261125-sol-pr395-architecture.md`: the same boundary for one derived boolean. `sdd/reviews/20261122-sol-pr358-architecture.md`: the same boundary for one derived limit. `sdd/reviews/20261121-sol-pr331-architecture.md`: unit properties stay internally derived. The checkbox rule recorded from `sdd/reviews/20261121-sol-pr334-architecture.md` still applies: the canonical plan checkbox stays `[ ]` until the gate is actually done. Closed unit kinds stay `UnitKind` / `UnitState`. The change stays in the media-broker D-Bus adapter; it does not cross into a Kotlin port or an HTTP controller. Android architecture standards and the Spring/Kotlin backend standards do not apply to the behavior under review: the diff has no ViewModel, UiState, controller, or Kotlin change. ADR-001 still withholds `Ready` until the full namespace, address-family, `CPUQuota`, and RLIMIT set is effective. `sdd/PATTERNS.md` still keeps domain free of framework types; this cut does not add a domain type or a wire translator.

## Findings

No P0. No P1. No P2. No P3.

## Residuals (not findings)

- `003B-4B-3`, `003B-4B-4`, aggregate `003B-4B`, `003B-4C`, `003B-4`, `MEDIA-NORMALIZE-004`, TASK-005, and #7 stay open. No `Ready`, no catalog HTTP, no secrets, no deploy. This review does not check off `003B-4C`.
- `ProtectHome` stays unset after the #389 `ENXIO`. `CPUQuota` and `RestrictAddressFamilies` stay unset. This diff does not add them.
- `ProtectHostname`, `RestrictSUIDSGID`, `ProtectClock`, `ProtectKernelLogs`, and `ProtectKernelModules` stay unset. This cut attests one derived boolean. It does not close `003B-4C`.
- The PID 1 attest reads `systemctl` `ProtectControlGroups`. It does not show that the worker process is denied a cgroup write. That behavioral probe remains part of the open `003B-4C` harness.
- `meta.md` is outside the diff and still ends on the persisted #397 gate. It does not name head `b8ab5a36848c33ff7834ecd9637c85d9f4b6cb61`. The implementation banner and progress carry this cut.
- Pre-rebase Verify `45665729714` on `6937daf287f266912b811970a1adf777938253e5` is superseded and is not evidence for this head.
- This review file is not a GitHub approval, a merge, or a `Ready` declaration, and it does not mark `003B-4C` closed.

## Conclusion

Head `b8ab5a36848c33ff7834ecd9637c85d9f4b6cb61` derives `ProtectControlGroups=true` inside `worker_properties` and attests, on PID 1, that job `[0x19; 16]` starts and `systemctl` reports `ProtectControlGroups` as `yes` or `true`. `ProtectHome`, `CPUQuota`, and `RestrictAddressFamilies` stay unset. Verify `45674345804` is success 7/7 on this SHA, attempt 1, none cancelled. `media-broker-pid1` `139417866865` records `pid1_worker_protect_control_groups ... ok` (`23 passed; 0 failed`). `media-broker` `139417867087` passed `derived_worker_protect_control_groups` (`70 passed; 0 failed; 23 ignored`). `003B-4C`, `Ready`, HTTP, `003B-4B-3`, `003B-4B-4`, and TASK-005 stay open. The remaining namespaces stay out. No inject-ready claim. No P0–P3. `APPROVED` for the architecture lane. This file is not a GitHub approval and does not mark `003B-4C` closed.
