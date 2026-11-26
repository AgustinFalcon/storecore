VERDICT: APPROVED

## Evidence identity

- provider: xAI
- model: Grok 4.7
- effort: medium
- substitute-for: gpt-5.6-sol-medium (no quota)
- lane: architecture
- independent of the security lane. This review did not read `sdd/reviews/20261126-sol-pr416-security.md`
- PR: 416 OPEN `feat(media): attest PID 1 LimitSTACK on the worker unit` https://github.com/AgustinFalcon/storecore/pull/416
- branch: `feat/media-broker-4c-limit-stack-20261126`
- head SHA: `037fadb1429a4b39bff79c95cdbba1fe2cbe1e9a` (`gh pr view 416` `headRefOid`; `git rev-parse HEAD`). Subject: `feat(media): attest PID 1 LimitSTACK on the worker unit`
- base / `origin/master`: `52922f5edd043d73563bba43467dab58613fbab9` (`git rev-parse origin/master` and `git merge-base origin/master HEAD`). Commit subject: `Merge pull request #415 from AgustinFalcon/feat/phase1-calendar-reminder-switch-contract`. Rebase onto `52922f5` is the recorded base. Pre-rebase head `a875ac7f4e967f35e75224fa6722ab8cd0b1aba7` and Verify `45858025897` (attempt 2, `headSha` `a875ac7`, success) are superseded. This review covers `037fadb` only
- one commit on the merge-base: `037fadb1429a4b39bff79c95cdbba1fe2cbe1e9a`
- diff identity: `git diff --stat origin/master...037fadb1429a4b39bff79c95cdbba1fe2cbe1e9a` is 3 files, +110 / −12. `git diff --check` on that range exited 0 with no output
- `gh pr view 416`: `OPEN`, base `master`, head `feat/media-broker-4c-limit-stack-20261126`. The PR body says `LimitSTACK` is `RLIMIT_STACK` at 8 MiB, that it is not `LimitAS`, and that `003B-4C` stays open. The test plan still leaves hosted Verify, the dual reviews, and the `003B-4C` / TASK-005 / HTTP close-out unchecked. This review does not edit that body and does not check those boxes
- worktree at review time was already `feat/media-broker-4c-limit-stack-20261126` at `037fadb1429a4b39bff79c95cdbba1fe2cbe1e9a`. No checkout
- untracked persist leftovers (`sdd/reviews/20261124-sol-pr365-*.md` through `20261126-sol-pr414-*.md`) are outside this three-dot diff and were not staged
- local cargo: not run. This host is Windows. The new PID 1 test is `#[ignore]` and runs in `media-broker-pid1`. Focused validation is hosted Verify `45866580240`
- this file is not a GitHub approval and does not mark `003B-4C` closed

## Job conclusions (Verify 45866580240)

`gh run view 45866580240`: event `pull_request`, name `Verify`, status `completed`, conclusion `success`, headSha `037fadb1429a4b39bff79c95cdbba1fe2cbe1e9a`, `attempt` 1. `gh run list --commit 037fadb1429a4b39bff79c95cdbba1fe2cbe1e9a` returns that single Verify run. `gh pr checks 416` reports the same seven jobs `pass`. Attempt 1 jobs are all `completed` / `success`. None cancelled. Temurin was not retargeted. `.github/workflows/verify.yml` is not in the diff. `media-broker-pid1` stays `timeout-minutes: 40`. On this SHA `java-version` stays `21.0.13+9.0.LTS` with `check-latest: false`. The pin step name stays `Pin Temurin 21.0.13+9`. The successful pid1 log resolves Java from the tool-cache as `21.0.13+9.0.LTS` and the pin script prints `pinned java runtime 21.0.13+9-LTS vendor Eclipse Adoptium`.

Attempt 1 job records (`gh pr checks 416` and the jobs API):

- repository-hygiene `140070833262`: `completed` / `success` (12s, `2026-11-26T17:18:18Z`–`2026-11-26T17:18:30Z`)
- media-broker `140070948604`: `completed` / `success` (1m9s, `2026-11-26T17:18:32Z`–`2026-11-26T17:19:41Z`)
- frontend `140070948682`: `completed` / `success` (5m11s, `2026-11-26T17:18:32Z`–`2026-11-26T17:23:43Z`)
- unified-access-real-e2e `140070948499`: `completed` / `success` (5m36s, `2026-11-26T17:18:32Z`–`2026-11-26T17:24:08Z`)
- productive-routes-real-e2e `140070948465`: `completed` / `success` (7m42s, `2026-11-26T17:18:31Z`–`2026-11-26T17:26:13Z`)
- backend `140070948435`: `completed` / `success` (16m40s, `2026-11-26T17:18:32Z`–`2026-11-26T17:35:12Z`)
- media-broker-pid1 `140070948425`: `completed` / `success` (26m35s, `2026-11-26T17:18:32Z`–`2026-11-26T17:45:07Z`)

`media-broker` `140070948604` records `dbus::tests::derived_worker_limit_stack_is_rlimit ... ok` and `test result: ok. 78 passed; 0 failed; 31 ignored`. The new PID 1 test is ignored there. `media-broker-pid1` `140070948425` records `test dbus::tests::pid1_worker_limit_stack ... ok` and `test result: ok. 31 passed; 0 failed; 0 ignored; 0 measured; 78 filtered out` (cargo time 1522.32s). A log filter for `core-dump`, `coredump`, `hs_err`, and `ENXIO` on that job matched 0 lines. The 40-minute timeout is unchanged harness time for those 31 PID 1 tests. It is not `Ready`.

## Diff reviewed

`git diff 52922f5edd043d73563bba43467dab58613fbab9...037fadb1429a4b39bff79c95cdbba1fe2cbe1e9a`: 3 files, +110 / −12. One commit:

- `037fadb1429a4b39bff79c95cdbba1fe2cbe1e9a` adds `LimitSTACK` at 8 MiB, the derived test, the ignored PID 1 test, and the STATUS/progress banner

| File | change |
| --- | --- |
| `backend/media-broker/src/dbus.rs` | `WORKER_LIMIT_STACK` is `8 * 1024 * 1024`. `worker_properties` sends `LimitSTACK` after `LimitDATA`. `derived_worker_limit_stack_is_rlimit` locks that key and the continued absence of `ProtectHome`, `RestrictAddressFamilies`, and `CPUQuota`. Ignored PID 1 test starts job `[0x21; 16]` and reads `systemctl` `LimitSTACK` |
| `sdd/STATUS.md` | implementation banner is `4C RLIMIT STACK del worker` and leaves `003B-4C` open. The master section stays LimitDATA PR #413 |
| `sdd/wip/.../4-implementation/progress.md` | same 8 MiB claim. `003B-4C` is not marked. No socket family, global quota, `Ready`, or media HTTP |

`plan.md`, `spec.md`, `meta.md`, ADR-001, and `verify.yml` are not in the diff. No Kotlin, Angular, migration, fixture, lockfile, HTTP route, Java pin, timeout change, or secret.

## Why this cut

`003B-4C` in `plan.md` on this SHA is still `- [ ]` (line 89): harness Linux real con UID A/UID B, SELF_TEST/NORMALIZE dentro de la unidad, attestación efectiva de cgroup v2/mount/quota, aislamiento entre jobs, fallos y reinicios. `003B-4B-3` (line 84), `003B-4B-4` (line 87), `MEDIA-NORMALIZE-004` (line 93), and TASK-005 (line 16) stay `[ ]`. TASK-004 stays `[x]` and is a different checkbox. The technical spec (`2-technical/spec.md`, the `003B-4C` paragraph) still requires SELF_TEST/NORMALIZE, isolation, per-job and global quota, terminals without ACK, FD/mmap after the seal, OOM/timeout, cgroup termination, substitution rejection, and restart on every durable transition before that gate can close. It still says only `003B-4A+4B+4C` can complete `003B-4`, and HTTP stays outside this residual. ADR-001 still withholds `Ready` until namespaces, no AF_INET/AF_INET6, `CPUQuota`, and RLIMIT are effective, and the attestation list still includes RLIMIT. `meta.md` estado remains `implementation_in_progress` and its gate paragraph still ends on PR #413 `LimitDATA`. The functional spec is outside the diff. This cut does not add media HTTP.

STATUS says this cut does not close `003B-4C`. It derives `LimitSTACK=8MiB` (`RLIMIT_STACK`) and attests that PID 1 reads it. The property is not `LimitAS`. `ProtectHome`, `CPUQuota`, and `RestrictAddressFamilies` stay out. Socket family, global quota, terminals without ACK, FD/mmap after the seal, restart on each durable transition, and `Ready` stay absent. No media HTTP. The other worker RLIMIT properties stay from the previous cuts.

The tree matches that claim. The GitHub summary matches the 8 MiB tree. This review does not check the PR test-plan boxes.

## Implementation

`WORKER_MEMORY_MAX_BYTES` remains `192 * 1024 * 1024`. `WORKER_LIMIT_AS` remains `32 * WORKER_MEMORY_MAX_BYTES`. `WORKER_LIMIT_DATA` remains `WORKER_LIMIT_AS`. `WORKER_LIMIT_STACK` is `8 * 1024 * 1024` (8,388,608 bytes). The constant is module-private. `worker_properties` takes only `&TransientUnits` and is the only worker property bag. It appends `("LimitSTACK", Value::from(WORKER_LIMIT_STACK))` after `LimitDATA` and before `PrivateNetwork`. `MemoryMax` stays the separate cgroup property at `WORKER_MEMORY_MAX_BYTES`. `LimitAS` stays the address-space property. `properties` sends the worker bag for `UnitKind::Worker` and does not send it for `UnitKind::Mount`. There is no new argument, spec field, or client property for this ceiling. The module comment still says the client never supplies a method name, unit name, `Where`, or `ExecStart`. `UnitKind` and `UnitState` stay the closed unit types, with `Unknown` at the wire edge. `LimitSTACK` is not a new string state in a view.

`worker_properties` still does not set `ProtectHome`, `CPUQuota`, or `RestrictAddressFamilies`. `LimitNOFILE`, `LimitNPROC`, `LimitCORE`, `LimitFSIZE`, `LimitCPU`, `LimitAS`, `LimitDATA`, and `ProtectKernelModules` remain. `derived_worker_limit_stack_is_rlimit` builds a spec for in-process job `[0xab; 16]` and asserts `LimitSTACK` is present, that the value debug form contains the constant's decimal, and that `ProtectHome`, `RestrictAddressFamilies`, and `CPUQuota` are absent. The 8 MiB factor lives only in `WORKER_LIMIT_STACK`. The test follows that constant. It does not alias `LimitAS`.

`pid1_worker_limit_stack` is ignored unless `/proc/1/comm` is `systemd` and euid is 0. It derives job `[0x21; 16]` and principal `2102:2102`, starts the mount, writes the existing `SELF_TEST` `request.bin`, and starts the worker through PID 1. `[0x21; 16]` is not used by another `JobId::create` (`[0x20; 16]` stays on `pid1_worker_limit_data`). The `0x21` byte inside `SELF_TEST_REQUEST` is payload, not a job id. If `StartTransientUnit` returns `Err`, the test panics that derived `LimitSTACK` was rejected. `systemctl show -p LimitSTACK --value` must equal the decimal constant or start with `expected:`. Stop of the worker and the mount accepts `Inactive` or `Failed`. The hosted job reached `ok`.

`start_transient` waits for `UnitState::is_active` and returns `Ok(Failed)` when the unit fails. The new test treats any `Ok` as acceptance, so a later failure can still leave the property readable. On this head the same worker bag ran the whole ignored suite: `31 passed; 0 failed`, and the pid1 log has no `core-dump` line and no `ENXIO` line. The dedicated test itself remains a PID 1 property read.

`timeout-minutes: 40` is not touched. On this SHA the pid1 wall time is 26m35s and the cargo report is 1522.32s, both inside 40 minutes. The workflow pin on this SHA stays `21.0.13+9.0.LTS`. This review does not retarget it.

## Ledger

- `sdd/STATUS.md` banner is `4C RLIMIT STACK del worker`. It says this cut does not close `003B-4C`. It names derived `LimitSTACK=8MiB` (`RLIMIT_STACK`) and a PID 1 read. The property is not `LimitAS`. `ProtectHome`, `CPUQuota`, and `RestrictAddressFamilies` stay out. Socket family, global quota, terminals without ACK, FD/mmap after the seal, restart, and `Ready` stay absent. `003B-4B-3`, `003B-4B-4`, `003B-4C`, `003B-4`, TASK-005, and #7 stay open. No media HTTP.
- The master section still records merged PR #413 and `LimitDATA`. It does not claim this unmerged head is master and does not close `003B-4C`.
- `progress.md` records the same 8 MiB derivation, says the ceiling is not `LimitAS`, and says `003B-4C` is not marked. No socket family, global quota, `Ready`, or media HTTP.
- `plan.md` is not in the diff. `MEDIA-NORMALIZE-003B-4C` remains `- [ ]` at line 89. `003B-4B-3`, `003B-4B-4`, `MEDIA-NORMALIZE-004`, and TASK-005 remain `[ ]`.

## Standards applied

`sdd/reviews/20261126-sol-pr413-architecture.md`: a PID 1 attest of one derived worker property stays inside the harness and leaves `003B-4C`, `Ready`, and HTTP open. The same boundary is the recorded pattern for one derived limit. The checkbox rule still applies: the canonical plan checkbox stays `[ ]` until the gate is actually done. Closed unit kinds stay `UnitKind` / `UnitState`. The change stays in the media-broker D-Bus adapter; it does not cross into a Kotlin port or an HTTP controller. Android architecture standards and the Spring/Kotlin backend standards do not apply to the behavior under review: the diff has no ViewModel, UiState, controller, or Kotlin change. ADR-001 still withholds `Ready` until the full namespace, address-family, `CPUQuota`, and RLIMIT set is effective, and still requires worker properties to be derived internally. `sdd/PATTERNS.md` still keeps the Kotlin domain free of framework types; this cut does not add a domain type or a wire translator. No new architecture gap: this is one derived `RLIMIT_STACK` on the existing worker bag, set to 8 MiB, with the other worker RLIMIT attests left in place and `003B-4C` left open.

## Gaps

No P0. No P1. No P2. No P3.

## Residuals (not findings)

- `003B-4B-3`, `003B-4B-4`, aggregate `003B-4B`, `003B-4C`, `003B-4`, `MEDIA-NORMALIZE-004`, TASK-005, and #7 stay open. No `Ready`, no catalog HTTP, no secrets, no deploy. This review does not check off `003B-4C`.
- `ProtectHome` stays unset after the earlier `ENXIO`. `CPUQuota` and `RestrictAddressFamilies` stay unset. This diff does not add them. The pid1 log on this head has no `ENXIO` line.
- Next residual: global quota, terminals without ACK, FD/mmap after the seal, and restart on each durable transition. Socket family and `Ready` stay out. Worker RLIMIT attests are otherwise in place. This cut attests one derived stack ceiling. It does not close `003B-4C`.
- The PID 1 attest reads `systemctl` `LimitSTACK`. It accepts `Ok(Failed)` from `start_transient`. It does not by itself prove the worker process stayed mapped. On this head the rest of the PID 1 suite passed with no `core-dump` line.
- `meta.md` is outside the diff and still ends on the persisted #413 gate. It does not name head `037fadb1429a4b39bff79c95cdbba1fe2cbe1e9a`. The implementation banner and progress carry this cut.
- Verify `45858025897` on `a875ac7` is the pre-rebase run. It is not evidence for this head.
- This review file is not a GitHub approval, a merge, or a `Ready` declaration, and it does not mark `003B-4C` closed. No inject-ready claim. No media HTTP.

## Conclusion

Head `037fadb1429a4b39bff79c95cdbba1fe2cbe1e9a` derives `LimitSTACK` as `8 * 1024 * 1024` inside `worker_properties` and attests, on PID 1, that job `[0x21; 16]` starts and `systemctl` reports that ceiling exactly or with an `expected:` prefix. The value is `RLIMIT_STACK`, not `LimitAS`. The client cannot supply it. `ProtectKernelModules` stays `true`. `LimitAS` and `LimitDATA` stay at the same 32× heap. `ProtectHome`, `CPUQuota`, and `RestrictAddressFamilies` stay unset. `media-broker-pid1` `timeout-minutes` stays 40. The Temurin pin on this SHA stays `21.0.13+9.0.LTS` (`pinned java runtime 21.0.13+9-LTS`). Verify `45866580240` is success 7/7 on this SHA, attempt 1, none cancelled. `media-broker-pid1` `140070948425` records `pid1_worker_limit_stack ... ok` (`31 passed; 0 failed`) and no `core-dump` or `ENXIO` line. `media-broker` `140070948604` passed `derived_worker_limit_stack_is_rlimit` (`78 passed; 0 failed; 31 ignored`). `003B-4C`, `Ready`, HTTP, `003B-4B-3`, `003B-4B-4`, and TASK-005 stay open. Next residual is global quota, terminals without ACK, FD/mmap, and restart. No inject-ready claim. No P0–P3. `APPROVED` for the architecture lane. This file is not a GitHub approval and does not mark `003B-4C` closed.
