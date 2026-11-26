VERDICT: APPROVED

## Evidence identity

- provider: xAI
- model: Grok 4.7
- effort: medium
- substitute-for: gpt-5.6-sol-medium (no quota)
- lane: architecture
- independent of the security lane. This review did not read `sdd/reviews/20261125-sol-pr409-security.md`
- PR: 409 OPEN `feat(media): attest PID 1 ProtectKernelModules on the worker unit` https://github.com/AgustinFalcon/storecore/pull/409
- branch: `feat/media-broker-4c-protect-kernel-modules-20261125`
- head SHA: `dc6219c3eb0f31d7d539308a665705ddadc74621` (`gh pr view 409` `headRefOid`; `git rev-parse HEAD`). Subject: `ci: raise media-broker-pid1 timeout for the growing PID 1 suite`
- base / `origin/master`: `6552fd77ddd3b70023850c3c508818c16a2e1885` (`git rev-parse origin/master` and `git merge-base origin/master HEAD`). Commit subject: `docs: persist PR 407 dual Grok reviews without closing 4C (#408)`. Persist of #408 of ProtectKernelLogs #407
- two commits on the merge-base: `bf4576935c26c009ec140ec87d4a260a740afcc0` `feat(media): attest PID 1 ProtectKernelModules on the worker unit`; `dc6219c3eb0f31d7d539308a665705ddadc74621` `ci: raise media-broker-pid1 timeout for the growing PID 1 suite`
- diff identity: `git diff --stat 6552fd77ddd3b70023850c3c508818c16a2e1885...dc6219c3eb0f31d7d539308a665705ddadc74621` is 4 files, +104 / −10. `git diff --check` on that range exited 0 with no output
- `gh pr view 409`: `OPEN`, base `master`, head `feat/media-broker-4c-protect-kernel-modules-20261125`. The PR body still leaves hosted Verify, the dual reviews, and the `003B-4C` / TASK-005 / HTTP close-out unchecked. This review does not edit that body and does not check those boxes
- worktree at review time was already `feat/media-broker-4c-protect-kernel-modules-20261125` at `dc6219c3eb0f31d7d539308a665705ddadc74621`. No checkout
- untracked persist-of-persist leftovers (`sdd/reviews/20261124-sol-pr365-*.md`, `20261124-sol-pr373-*.md`, `20261125-sol-pr376-*.md`, `20261125-sol-pr378-*.md`, `20261125-sol-pr380-*.md`, `20261125-sol-pr382-*.md`, `20261125-sol-pr384-*.md`, `20261125-sol-pr386-*.md`, `20261125-sol-pr388-*.md`, `20261125-sol-pr390-*.md`, `20261125-sol-pr392-*.md`, `20261125-sol-pr394-*.md`, `20261125-sol-pr396-*.md`, `20261125-sol-pr398-*.md`, `20261125-sol-pr400-*.md`, `20261125-sol-pr402-*.md`, `20261125-sol-pr404-*.md`, `20261125-sol-pr406-*.md`, `20261125-sol-pr408-*.md`) are outside this three-dot diff and were not staged
- local cargo: not run. This host is Windows. The new PID 1 test is `#[ignore]` and runs in `media-broker-pid1`. Focused validation is hosted Verify `45727472681`
- pre-rebase SHA `1521434189c8544461a858d94d084991756f047d` and Verify `45712279884` (attempt 2, `success`, that older head) are superseded. This review covers head `dc6219c3eb0f31d7d539308a665705ddadc74621` only, including both commits
- Verify `45722480006` is the pre-timeout run on `bf4576935c26c009ec140ec87d4a260a740afcc0`. Its attempt 2 is `cancelled`. `media-broker-pid1` was `cancelled` from `2026-11-25T23:48:55Z` to `2026-11-26T00:14:11Z` (25m16s) while `timeout-minutes` was still 25. That run explains the second commit. It is not the pass for this head
- this file is not a GitHub approval and does not mark `003B-4C` closed

## Job conclusions (Verify 45727472681)

`gh run view 45727472681`: event `pull_request`, name `Verify`, status `completed`, conclusion `success`, headSha `dc6219c3eb0f31d7d539308a665705ddadc74621`, `attempt` 3. `gh run list --commit dc6219c3eb0f31d7d539308a665705ddadc74621` returns that single Verify run. `gh pr checks` / `statusCheckRollup` report the same seven jobs `pass`. Attempt 3 jobs are all `completed` / `success`. None cancelled. Temurin was not retargeted. The workflow diff changes only `media-broker-pid1` `timeout-minutes` from 25 to 40. `java-version` stays `21.0.13+9` on the backend, pid1, unified, and productive jobs. The successful pid1 log resolves and pins Temurin 21.0.13+9 (`pinned java runtime 21.0.13+9-LTS`). The successful backend log completes `Pin Temurin 21.0.13+9` the same way.

Attempts 1 and 2 on the same SHA failed outside this diff and were rerun. Attempt 1 `failure`: `unified-access-real-e2e` `139600922429` failed in 18s with `No matching version found for SemVer '21.0.13+9'`; `backend` `139600922471` pinned 21.0.13+9 and then failed collecting the surefire-junit-platform 3.5.4 descriptor (`BUILD FAILURE`). `media-broker-pid1` `139600922581` still reached `success` in 26m53s (`2026-11-26T00:16:03Z`–`2026-11-26T00:42:56Z`). A 25-minute job timeout would have cancelled that step. Attempt 2 `failure`: `backend` `139621053293` failed with the same SemVer `21.0.13+9` resolver miss. Attempt 3 reran the failed jobs and finished `success`. GitHub kept the earlier successful jobs for this SHA. The pin stays 21.0.13+9.

- repository-hygiene `139623570560`: `completed` / `success` (10s, `2026-11-26T00:15:51Z`–`2026-11-26T00:16:01Z`)
- media-broker `139623571815`: `completed` / `success` (1m13s, `2026-11-26T00:16:03Z`–`2026-11-26T00:17:16Z`)
- unified-access-real-e2e `139623571240`: `completed` / `success` (6m6s, `2026-11-26T01:06:57Z`–`2026-11-26T01:13:03Z`)
- productive-routes-real-e2e `139623571388`: `completed` / `success` (7m1s, `2026-11-26T00:16:02Z`–`2026-11-26T00:23:03Z`)
- frontend `139623616916`: `completed` / `success` (5m58s, `2026-11-26T00:16:03Z`–`2026-11-26T00:22:01Z`)
- backend `139623568921`: `completed` / `success` (13m35s, `2026-11-26T01:13:28Z`–`2026-11-26T01:27:03Z`)
- media-broker-pid1 `139623571048`: `completed` / `success` (26m53s, `2026-11-26T00:16:03Z`–`2026-11-26T00:42:56Z`)

`media-broker` `139623571815` records `dbus::tests::derived_worker_protect_kernel_modules ... ok` and `test result: ok. 75 passed; 0 failed; 28 ignored`. The new PID 1 test is ignored there. `media-broker-pid1` `139623571048` records `test dbus::tests::pid1_worker_protect_kernel_modules ... ok` and `test result: ok. 28 passed; 0 failed; 0 ignored; 0 measured; 75 filtered out` (cargo time 1548.85s). The log filter for `ENXIO` on that job matched 0 lines. There is no `ENXIO` on `ProtectKernelModules`. The 40-minute timeout is harness time for those 28 PID 1 tests. It is not `Ready`.

## Diff reviewed

`git diff 6552fd77ddd3b70023850c3c508818c16a2e1885...dc6219c3eb0f31d7d539308a665705ddadc74621`: 4 files, +104 / −10. Two commits, both in this review:

- `bf4576935c26c009ec140ec87d4a260a740afcc0` `feat(media): attest PID 1 ProtectKernelModules on the worker unit`
- `dc6219c3eb0f31d7d539308a665705ddadc74621` `ci: raise media-broker-pid1 timeout for the growing PID 1 suite`

| File | change |
| --- | --- |
| `backend/media-broker/src/dbus.rs` | `worker_properties` gains an internal `ProtectKernelModules=true` after `ProtectKernelLogs=true`. `derived_worker_protect_kernel_modules` locks that key and the continued absence of `ProtectHome`, `RestrictAddressFamilies`, and `CPUQuota`. Ignored PID 1 test starts job `[0x1e; 16]` and reads `systemctl` `yes`/`true` |
| `.github/workflows/verify.yml` | `media-broker-pid1` `timeout-minutes` 25 → 40. Temurin `21.0.13+9` is untouched |
| `sdd/STATUS.md` | implementation banner is `4C ProtectKernelModules del worker` and leaves `003B-4C` open. The master section stays ProtectKernelLogs PR #407 |
| `sdd/wip/.../4-implementation/progress.md` | same claim, plus the timeout reason (`45722480006` attempt 2 cancelled at 25m16s). `003B-4C` is not marked |

`plan.md`, `spec.md`, `meta.md`, and ADR-001 are not in the diff. No Kotlin, Angular, migration, fixture, lockfile, HTTP route, Java pin, or secret.

## Why this cut

`003B-4C` in `plan.md` on this SHA is still `- [ ]` (line 89): harness Linux real con UID A/UID B, SELF_TEST/NORMALIZE dentro de la unidad, attestación efectiva de cgroup v2/mount/quota, aislamiento entre jobs, fallos y reinicios. The technical spec (`2-technical/spec.md` via ADR-001) still requires SELF_TEST/NORMALIZE, isolation, per-job and global quota, terminals without ACK, FD/mmap after the seal, OOM/timeout, cgroup termination, substitution rejection, and restart on every durable transition before that gate can close. ADR-001 still withholds `Ready` until namespaces, no AF_INET/AF_INET6, `CPUQuota`, and RLIMIT are effective, and still says only `4A+4B+4C` can complete `003B-4`. `003B-4B-3`, `003B-4B-4`, `MEDIA-NORMALIZE-003B-4`, `MEDIA-NORMALIZE-004`, and `TASK-005` stay `[ ]`. `meta.md` estado remains `implementation_in_progress` and its gate paragraph still ends on PR #407 ProtectKernelLogs. The functional spec is outside the diff; its catalog upload states are a separate closed set and this cut does not add media HTTP.

STATUS says this cut does not close `003B-4C`. It derives `ProtectKernelModules=true` and attests that PID 1 reads it. `ProtectHome`, `CPUQuota`, and `RestrictAddressFamilies` stay out. Socket family, global quota, terminals without ACK, FD/mmap, restart on each durable transition, remaining RLIMIT, and `Ready` stay absent. No media HTTP. `ProtectKernelLogs` stays `true` from the previous cut.

The PR body matches the tree: the boolean is derived inside `worker_properties`, the client does not supply it, PID 1 reads the effective property, the three unset properties stay unset, and `003B-4C` stays open. The PR test plan leaves Verify, the dual reviews, and the close-out unchecked. This review does not check them off. The timeout bump is recorded in `progress.md` as harness capacity. It does not declare `Ready`.

## Implementation

`ProtectKernelModules` is the literal `Value::from(true)` at the end of `worker_properties`, after `ProtectKernelLogs`. That function takes only `&TransientUnits` and is the only worker property bag. `properties` sends it for `UnitKind::Worker` and does not send it for `UnitKind::Mount`. There is no new argument, spec field, or client property for this boolean. `UnitKind` and `UnitState` stay the closed unit types. The property is not a new string state in a view.

`worker_properties` still does not set `ProtectHome`, `CPUQuota`, or `RestrictAddressFamilies`. `ProtectKernelLogs` remains `Value::from(true)`. `derived_worker_protect_kernel_modules` builds a spec for in-process job `[0xab; 16]` and asserts the key is present, that its debug form contains `true`, and that `ProtectHome`, `RestrictAddressFamilies`, and `CPUQuota` are absent.

`pid1_worker_protect_kernel_modules` is ignored unless `/proc/1/comm` is `systemd` and euid is 0. It derives job `[0x1e; 16]` and principal `2102:2102`, starts the mount, writes the existing `SELF_TEST` `request.bin`, and starts the worker through PID 1. `[0x1e; 16]` is not used by another PID 1 test (`[0x1d; 16]` stays on `pid1_worker_protect_kernel_logs`; `[0x1c; 16]` stays on `pid1_worker_protect_clock`; `[0x1b; 16]` stays on `pid1_worker_restrict_suidsgid`; `[0x1a; 16]` stays on `pid1_worker_protect_hostname`; `[0x10; 16]` through `[0x19; 16]` stay on their existing cases). The `0x1e` byte inside `SELF_TEST_REQUEST` is payload, not a job id. If `StartTransientUnit` fails, the test panics that derived `ProtectKernelModules` was rejected. `systemctl show -p ProtectKernelModules --value` must be exactly `yes` or `true`. Stop of the worker and the mount accepts `Inactive` or `Failed`. The hosted job reached `ok`. That is a PID 1 property read after a real start, not an `ENXIO` rejection and not a worker probe that kernel modules cannot be loaded.

`ProtectHome` remains a separate earlier attest (`pid1_worker_protect_home`, job `[0x14; 16]`). This diff does not set it. The pid1 binary finished `28 passed; 0 failed`, so the previous harness cases still ran with `ProtectKernelModules=true` and `ProtectKernelLogs=true` on the worker bag.

`timeout-minutes: 40` applies only to `media-broker-pid1`. The suite is 28 ignored PID 1 tests. On this SHA the job wall time is 26m53s and the cargo report is 1548.85s, both past 25 minutes. On `bf45769`, before this bump, Verify `45722480006` attempt 2 cancelled that job at 25m16s. The second commit gives the harness room. It does not add a property, close a checkbox, or retarget Java.

## Ledger

- `sdd/STATUS.md` banner is `4C ProtectKernelModules del worker`. It says this cut does not close `003B-4C`. It names derived `ProtectKernelModules=true` and a PID 1 read. `ProtectHome`, `CPUQuota`, and `RestrictAddressFamilies` stay out. Socket family, global quota, terminals without ACK, FD/mmap, restart, remaining RLIMIT, and `Ready` stay absent. `003B-4B-3`, `003B-4B-4`, `003B-4C`, `003B-4`, TASK-005, and #7 stay open. No media HTTP.
- The master section still records merged `3fd9f599c7e2e3c613f4829b09625276c12dec96` / PR #407 and `ProtectKernelLogs=true`. It does not claim this unmerged head is master and does not close `003B-4C`.
- `progress.md` records the same derivation and the same unset properties, records the timeout bump against cancelled run `45722480006`, and says `003B-4C` is not marked. No socket family, global quota, `Ready`, or media HTTP.
- `plan.md` is not in the diff. `MEDIA-NORMALIZE-003B-4C` remains `- [ ]` at line 89. `003B-4B-3`, `003B-4B-4`, `MEDIA-NORMALIZE-004`, and TASK-005 remain `[ ]`.

## Standards applied

`sdd/reviews/20261125-sol-pr407-architecture.md`: a PID 1 attest of one derived worker boolean stays inside the harness and leaves `003B-4C`, `Ready`, and HTTP open. `sdd/reviews/20261125-sol-pr405-architecture.md`: the same boundary for one derived boolean. `sdd/reviews/20261125-sol-pr403-architecture.md`: the same boundary for one derived boolean. `sdd/reviews/20261125-sol-pr401-architecture.md`: the same boundary for one derived boolean. `sdd/reviews/20261122-sol-pr358-architecture.md`: the same boundary for one derived limit. `sdd/reviews/20261121-sol-pr331-architecture.md`: unit properties stay internally derived. The checkbox rule recorded from `sdd/reviews/20261121-sol-pr334-architecture.md` still applies: the canonical plan checkbox stays `[ ]` until the gate is actually done. Closed unit kinds stay `UnitKind` / `UnitState`. The change stays in the media-broker D-Bus adapter and the pid1 job timeout; it does not cross into a Kotlin port or an HTTP controller. Android architecture standards and the Spring/Kotlin backend standards do not apply to the behavior under review: the diff has no ViewModel, UiState, controller, or Kotlin change. ADR-001 still withholds `Ready` until the full namespace, address-family, `CPUQuota`, and RLIMIT set is effective, and still requires worker properties to be derived internally. `sdd/PATTERNS.md` still keeps the Kotlin domain free of framework types; this cut does not add a domain type or a wire translator. No new architecture gap: this is one derived boolean on the existing worker bag, plus harness time so the 28 PID 1 tests can finish.

## Findings

No P0. No P1. No P2. No P3.

## Residuals (not findings)

- `003B-4B-3`, `003B-4B-4`, aggregate `003B-4B`, `003B-4C`, `003B-4`, `MEDIA-NORMALIZE-004`, TASK-005, and #7 stay open. No `Ready`, no catalog HTTP, no secrets, no deploy. This review does not check off `003B-4C`.
- `ProtectHome` stays unset after the #389 `ENXIO`. `CPUQuota` and `RestrictAddressFamilies` stay unset. This diff does not add them.
- Next residuals: global quota, terminals without ACK, FD/mmap after the seal, remaining RLIMIT, and `Ready`. Socket family and restart on each durable transition stay out. This cut attests one derived boolean and gives the PID 1 job 40 minutes. It does not close `003B-4C`.
- The PID 1 attest reads `systemctl` `ProtectKernelModules`. It does not show that the worker process is denied kernel modules. That behavioral probe remains part of the open `003B-4C` harness.
- `timeout-minutes: 40` is harness capacity. The suite wall time on this SHA is 26m53s. It is not an inject-ready claim and not a `Ready` declaration.
- `meta.md` is outside the diff and still ends on the persisted #407 gate. It does not name head `dc6219c3eb0f31d7d539308a665705ddadc74621`. The implementation banner and progress carry this cut.
- Pre-rebase SHA `1521434189c8544461a858d94d084991756f047d` and Verify `45712279884` are superseded and are not evidence for this head. Verify `45722480006` on `bf45769` is the cancelled 25-minute run, not the pass.
- This review file is not a GitHub approval, a merge, or a `Ready` declaration, and it does not mark `003B-4C` closed. No inject-ready claim. No media HTTP.

## Conclusion

Head `dc6219c3eb0f31d7d539308a665705ddadc74621` derives `ProtectKernelModules=true` inside `worker_properties` and attests, on PID 1, that job `[0x1e; 16]` starts and `systemctl` reports `ProtectKernelModules` as `yes` or `true`. `ProtectKernelLogs` stays `true`. `ProtectHome`, `CPUQuota`, and `RestrictAddressFamilies` stay unset. `media-broker-pid1` `timeout-minutes` is 40 because 28 PID 1 tests exceed 25 minutes. Temurin stays 21.0.13+9. Verify `45727472681` is success 7/7 on this SHA, attempt 3, none cancelled. `media-broker-pid1` `139623571048` records `pid1_worker_protect_kernel_modules ... ok` (`28 passed; 0 failed`). `media-broker` `139623571815` passed `derived_worker_protect_kernel_modules` (`75 passed; 0 failed; 28 ignored`). `003B-4C`, `Ready`, HTTP, `003B-4B-3`, `003B-4B-4`, and TASK-005 stay open. Next residuals are global quota, terminals without ACK, FD/mmap, remaining RLIMIT, and `Ready`. No inject-ready claim. No P0–P3. `APPROVED` for the architecture lane. This file is not a GitHub approval and does not mark `003B-4C` closed.
