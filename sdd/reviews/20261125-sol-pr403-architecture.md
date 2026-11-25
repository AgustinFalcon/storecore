VERDICT: APPROVED

## Evidence identity

- provider: xAI
- model: Grok 4.7
- effort: medium
- substitute-for: gpt-5.6-sol-medium (no quota)
- lane: architecture
- independent of the security lane. This review did not read `sdd/reviews/20261125-sol-pr403-security.md`
- PR: 403 OPEN `feat(media): attest PID 1 RestrictSUIDSGID on the worker unit` https://github.com/AgustinFalcon/storecore/pull/403
- branch: `feat/media-broker-4c-restrict-suidsgid-20261125`
- head SHA: `c18fe2a92e8dfca8b622ec2c32920fc613f588dd` (`gh pr view 403` `headRefOid`; `git rev-parse HEAD`). Subject: `feat(media): attest PID 1 RestrictSUIDSGID on the worker unit`
- base / `origin/master`: `2794cd027fff2571798683e4c2c3ce9e5c09f9c3` (`git rev-parse origin/master` and `git merge-base origin/master HEAD`). Commit subject: `docs: persist PR 401 dual Grok reviews without closing 4C (#402)`. Persist of #402 of ProtectHostname #401
- one commit on the merge-base: `c18fe2a92e8dfca8b622ec2c32920fc613f588dd`
- diff identity: `git diff --stat 2794cd027fff2571798683e4c2c3ce9e5c09f9c3...c18fe2a92e8dfca8b622ec2c32920fc613f588dd` is 3 files, +100 / −9. `git diff --check` on that range exited 0 with no output
- `gh pr view 403`: `OPEN`, base `master`, head `feat/media-broker-4c-restrict-suidsgid-20261125`. The PR body still leaves hosted Verify, the dual reviews, and the `003B-4C` / TASK-005 / HTTP close-out unchecked. This review does not edit that body and does not check those boxes
- worktree at review time was already `feat/media-broker-4c-restrict-suidsgid-20261125` at `c18fe2a92e8dfca8b622ec2c32920fc613f588dd`. No checkout
- untracked persist-of-persist leftovers (`sdd/reviews/20261124-sol-pr365-*.md`, `20261124-sol-pr373-*.md`, `20261125-sol-pr376-*.md`, `20261125-sol-pr378-*.md`, `20261125-sol-pr380-*.md`, `20261125-sol-pr382-*.md`, `20261125-sol-pr384-*.md`, `20261125-sol-pr386-*.md`, `20261125-sol-pr388-*.md`, `20261125-sol-pr390-*.md`, `20261125-sol-pr392-*.md`, `20261125-sol-pr394-*.md`, `20261125-sol-pr396-*.md`, `20261125-sol-pr398-*.md`, `20261125-sol-pr400-*.md`, `20261125-sol-pr402-*.md`) are outside this three-dot diff and were not staged
- local cargo: not run. This host is Windows. The new PID 1 test is `#[ignore]` and runs in `media-broker-pid1`. Focused validation is hosted Verify `45690798203`
- pre-rebase SHA `daddff3213e47f5de139dcc7707bfe342361ed97` and Verify `45686635140` are superseded. This review covers head `c18fe2a92e8dfca8b622ec2c32920fc613f588dd` only
- this file is not a GitHub approval and does not mark `003B-4C` closed

## Job conclusions (Verify 45690798203)

`gh run view 45690798203`: event `pull_request`, name `Verify`, status `completed`, conclusion `success`, headSha `c18fe2a92e8dfca8b622ec2c32920fc613f588dd`, `attempt` 1. `gh run list --commit c18fe2a92e8dfca8b622ec2c32920fc613f588dd` returns that single Verify run. `gh pr checks 403` reports the same seven jobs `pass`. The seven jobs are all `completed` / `success`. None cancelled. Temurin was not retargeted; this diff has no Java pin.

- repository-hygiene `139475404997`: `completed` / `success` (10s, `2026-11-25T20:00:55Z`–`2026-11-25T20:01:05Z`)
- media-broker `139475523444`: `completed` / `success` (1m13s, `2026-11-25T20:01:07Z`–`2026-11-25T20:02:20Z`)
- frontend `139475523445`: `completed` / `success` (4m7s, `2026-11-25T20:01:07Z`–`2026-11-25T20:05:14Z`)
- media-broker-pid1 `139475523448`: `completed` / `success` (23m27s, `2026-11-25T20:01:07Z`–`2026-11-25T20:24:34Z`)
- backend `139475523490`: `completed` / `success` (10m56s, `2026-11-25T20:01:07Z`–`2026-11-25T20:12:03Z`)
- productive-routes-real-e2e `139475523530`: `completed` / `success` (8m7s, `2026-11-25T20:01:07Z`–`2026-11-25T20:09:14Z`)
- unified-access-real-e2e `139475523752`: `completed` / `success` (5m59s, `2026-11-25T20:01:07Z`–`2026-11-25T20:07:06Z`)

`media-broker` `139475523444` records `dbus::tests::derived_worker_restrict_suidsgid ... ok` and `test result: ok. 72 passed; 0 failed; 25 ignored`. The new PID 1 test is ignored there. `media-broker-pid1` `139475523448` records `test dbus::tests::pid1_worker_restrict_suidsgid ... ok` and `test result: ok. 25 passed; 0 failed; 0 ignored; 0 measured; 72 filtered out`. The log filter for `ENXIO` on that job matched 0 lines. There is no `ENXIO` on `RestrictSUIDSGID`.

## Diff reviewed

`git diff 2794cd027fff2571798683e4c2c3ce9e5c09f9c3...c18fe2a92e8dfca8b622ec2c32920fc613f588dd`: 3 files, +100 / −9. One commit:

- `c18fe2a92e8dfca8b622ec2c32920fc613f588dd` `feat(media): attest PID 1 RestrictSUIDSGID on the worker unit`

| File | change |
| --- | --- |
| `backend/media-broker/src/dbus.rs` | `worker_properties` gains an internal `RestrictSUIDSGID=true`. `derived_worker_restrict_suidsgid` locks that key and the continued absence of `ProtectHome`, `RestrictAddressFamilies`, and `CPUQuota`. Ignored PID 1 test starts job `[0x1b; 16]` and reads `systemctl` `yes`/`true` |
| `sdd/STATUS.md` | implementation banner is `4C RestrictSUIDSGID del worker` and leaves `003B-4C` open. The master section stays ProtectHostname PR #401 |
| `sdd/wip/.../4-implementation/progress.md` | same claim; `003B-4C` is not marked |

`plan.md`, `spec.md`, `meta.md`, and ADR-001 are not in the diff. No Kotlin, Angular, workflow, migration, fixture, lockfile, HTTP route, Java pin, or secret.

## Why this cut

`003B-4C` in `plan.md` on this SHA is still `- [ ]` (line 89): harness Linux real con UID A/UID B, SELF_TEST/NORMALIZE dentro de la unidad, attestación efectiva de cgroup v2/mount/quota, aislamiento entre jobs, fallos y reinicios. The technical spec (`2-technical/spec.md`) still requires SELF_TEST/NORMALIZE, isolation, per-job and global quota, terminals without ACK, FD/mmap after the seal, OOM/timeout, cgroup termination, substitution rejection, and restart on every durable transition before that gate can close. ADR-001 still withholds `Ready` until namespaces, no AF_INET/AF_INET6, `CPUQuota`, and RLIMIT are effective, and still says only `4A+4B+4C` can complete `003B-4`. `003B-4B-3`, `003B-4B-4`, `MEDIA-NORMALIZE-003B-4`, `MEDIA-NORMALIZE-004`, and `TASK-005` stay `[ ]`. `meta.md` estado remains `implementation_in_progress` and its gate paragraph still ends on PR #401 ProtectHostname. The functional spec is outside the diff; its catalog upload states are a separate closed set and this cut does not add media HTTP.

STATUS says this cut does not close `003B-4C`. It derives `RestrictSUIDSGID=true` and attests that PID 1 reads it. `ProtectHome`, `CPUQuota`, and `RestrictAddressFamilies` stay out. Socket family, global quota, terminals without ACK, FD/mmap, restart on each durable transition, remaining RLIMIT, and `Ready` stay absent. No media HTTP. The remaining namespaces stay out: `ProtectClock`, `ProtectKernelLogs`, and `ProtectKernelModules`.

The PR body matches the tree: the boolean is derived inside `worker_properties`, the client does not supply it, PID 1 reads the effective property, the three unset properties stay unset, and `003B-4C` stays open. The PR test plan leaves Verify, the dual reviews, and the close-out unchecked. This review does not check them off.

## Implementation

`RestrictSUIDSGID` is the literal `Value::from(true)` at the end of `worker_properties`, after `ProtectHostname`. That function takes only `&TransientUnits` and is the only worker property bag. `properties` sends it for `UnitKind::Worker` and does not send it for `UnitKind::Mount`. There is no new argument, spec field, or client property for this boolean. `UnitKind` and `UnitState` stay the closed unit types. The property is not a new string state in a view.

`worker_properties` still does not set `ProtectHome`, `CPUQuota`, or `RestrictAddressFamilies`. It also does not set `ProtectClock`, `ProtectKernelLogs`, or `ProtectKernelModules`. `derived_worker_restrict_suidsgid` builds a spec for in-process job `[0xab; 16]` and asserts the key is present, that its debug form contains `true`, and that `ProtectHome`, `RestrictAddressFamilies`, and `CPUQuota` are absent.

`pid1_worker_restrict_suidsgid` is ignored unless `/proc/1/comm` is `systemd` and euid is 0. It derives job `[0x1b; 16]` and principal `2102:2102`, starts the mount, writes the existing `SELF_TEST` `request.bin`, and starts the worker through PID 1. `[0x1b; 16]` is not used by another PID 1 test (`[0x1a; 16]` stays on `pid1_worker_protect_hostname`; `[0x10; 16]` through `[0x19; 16]` stay on their existing cases). The `0x1b` byte inside `SELF_TEST_REQUEST` is payload, not a job id. If `StartTransientUnit` fails, the test panics that derived `RestrictSUIDSGID` was rejected. `systemctl show -p RestrictSUIDSGID --value` must be exactly `yes` or `true`. Stop of the worker and the mount accepts `Inactive` or `Failed`. The hosted job reached `ok`. That is a PID 1 property read after a real start, not an `ENXIO` rejection and not a worker probe that setuid/setgid is denied.

`ProtectHome` remains a separate earlier attest (`pid1_worker_protect_home`, job `[0x14; 16]`). This diff does not set it. The pid1 binary finished `25 passed; 0 failed`, so the previous harness cases still ran with `RestrictSUIDSGID=true` on the worker bag.

## Ledger

- `sdd/STATUS.md` banner is `4C RestrictSUIDSGID del worker`. It says this cut does not close `003B-4C`. It names derived `RestrictSUIDSGID=true` and a PID 1 read. `ProtectHome`, `CPUQuota`, and `RestrictAddressFamilies` stay out. Socket family, global quota, terminals without ACK, FD/mmap, restart, remaining RLIMIT, and `Ready` stay absent. `003B-4B-3`, `003B-4B-4`, `003B-4C`, `003B-4`, TASK-005, and #7 stay open. No media HTTP.
- The master section still records merged `e3f3cd4a59df5d57371062ac4989d97b779e73ba` / PR #401 and `ProtectHostname=true`. It does not claim this unmerged head is master and does not close `003B-4C`.
- `progress.md` records the same derivation and the same unset properties, and says `003B-4C` is not marked. No socket family, global quota, `Ready`, or media HTTP.
- `plan.md` is not in the diff. `MEDIA-NORMALIZE-003B-4C` remains `- [ ]`. `003B-4B-3`, `003B-4B-4`, `MEDIA-NORMALIZE-004`, and TASK-005 remain `[ ]`.

## Standards applied

`sdd/reviews/20261125-sol-pr401-architecture.md`: a PID 1 attest of one derived worker boolean stays inside the harness and leaves `003B-4C`, `Ready`, and HTTP open. `sdd/reviews/20261125-sol-pr399-architecture.md`: the same boundary for one derived boolean. `sdd/reviews/20261122-sol-pr358-architecture.md`: the same boundary for one derived limit. `sdd/reviews/20261121-sol-pr331-architecture.md`: unit properties stay internally derived. The checkbox rule recorded from `sdd/reviews/20261121-sol-pr334-architecture.md` still applies: the canonical plan checkbox stays `[ ]` until the gate is actually done. Closed unit kinds stay `UnitKind` / `UnitState`. The change stays in the media-broker D-Bus adapter; it does not cross into a Kotlin port or an HTTP controller. Android architecture standards and the Spring/Kotlin backend standards do not apply to the behavior under review: the diff has no ViewModel, UiState, controller, or Kotlin change. ADR-001 still withholds `Ready` until the full namespace, address-family, `CPUQuota`, and RLIMIT set is effective, and still requires worker properties to be derived internally. `sdd/PATTERNS.md` still keeps the Kotlin domain free of framework types; this cut does not add a domain type or a wire translator. No new architecture gap: this is one derived boolean on the existing worker bag.

## Findings

No P0. No P1. No P2. No P3.

## Residuals (not findings)

- `003B-4B-3`, `003B-4B-4`, aggregate `003B-4B`, `003B-4C`, `003B-4`, `MEDIA-NORMALIZE-004`, TASK-005, and #7 stay open. No `Ready`, no catalog HTTP, no secrets, no deploy. This review does not check off `003B-4C`.
- `ProtectHome` stays unset after the #389 `ENXIO`. `CPUQuota` and `RestrictAddressFamilies` stay unset. This diff does not add them.
- `ProtectClock`, `ProtectKernelLogs`, and `ProtectKernelModules` stay unset. Global quota, terminals without ACK, FD/mmap after the seal, remaining RLIMIT, and `Ready` stay out. This cut attests one derived boolean. It does not close `003B-4C`.
- The PID 1 attest reads `systemctl` `RestrictSUIDSGID`. It does not show that the worker process is denied setuid or setgid. That behavioral probe remains part of the open `003B-4C` harness.
- `meta.md` is outside the diff and still ends on the persisted #401 gate. It does not name head `c18fe2a92e8dfca8b622ec2c32920fc613f588dd`. The implementation banner and progress carry this cut.
- Pre-rebase SHA `daddff3213e47f5de139dcc7707bfe342361ed97` and Verify `45686635140` are superseded and are not evidence for this head.
- This review file is not a GitHub approval, a merge, or a `Ready` declaration, and it does not mark `003B-4C` closed.

## Conclusion

Head `c18fe2a92e8dfca8b622ec2c32920fc613f588dd` derives `RestrictSUIDSGID=true` inside `worker_properties` and attests, on PID 1, that job `[0x1b; 16]` starts and `systemctl` reports `RestrictSUIDSGID` as `yes` or `true`. `ProtectHome`, `CPUQuota`, and `RestrictAddressFamilies` stay unset. Verify `45690798203` is success 7/7 on this SHA, attempt 1, none cancelled. `media-broker-pid1` `139475523448` records `pid1_worker_restrict_suidsgid ... ok` (`25 passed; 0 failed`). `media-broker` `139475523444` passed `derived_worker_restrict_suidsgid` (`72 passed; 0 failed; 25 ignored`). `003B-4C`, `Ready`, HTTP, `003B-4B-3`, `003B-4B-4`, and TASK-005 stay open. The remaining namespaces stay out. No inject-ready claim. No P0–P3. `APPROVED` for the architecture lane. This file is not a GitHub approval and does not mark `003B-4C` closed.
