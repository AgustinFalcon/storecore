VERDICT: APPROVED

## Evidence identity

- provider: xAI
- model: Grok 4.7
- effort: medium
- substitute-for: gpt-5.6-sol-medium (no quota)
- lane: architecture
- independent of the security lane. This review did not read `sdd/reviews/20261126-sol-pr411-security.md`
- PR: 411 OPEN `feat(media): attest PID 1 LimitAS on the worker unit` https://github.com/AgustinFalcon/storecore/pull/411
- branch: `feat/media-broker-4c-limit-as-20261125`
- head SHA: `ca23f75174ed3a71ab1b4efabe1a52dfdd76449a` (`gh pr view 411` `headRefOid`; `git rev-parse HEAD`). Subject: `style: backtick HotSpot in LimitAS docs for clippy`
- base / `origin/master`: `fa840c08a707b18c4ac1c12f7eb9250dc94d9ecc` (`git rev-parse origin/master` and `git merge-base origin/master HEAD`). Commit subject: `docs: persist PR 409 dual Grok reviews without closing 4C (#410)`. Persist of #410 of ProtectKernelModules #409
- four commits on the merge-base: `f5b286c04e1b7aec56e2756a0dec81db85dbdca6` `feat(media): attest PID 1 LimitAS on the worker unit`; `de2321cf2757122b0b82cb0e1865c1f93ca5ebf0` `style: rustfmt dbus test imports for LimitAS`; `7f1b66c7fd1baa4ac30e24bff9bd1d3fcdfac031` `fix(media): raise LimitAS to 32x heap so HotSpot can map the JRE`; `ca23f75174ed3a71ab1b4efabe1a52dfdd76449a` `style: backtick HotSpot in LimitAS docs for clippy`
- diff identity: `git diff --stat origin/master...ca23f75174ed3a71ab1b4efabe1a52dfdd76449a` is 3 files, +118 / −12. `git diff --check` on that range exited 0 with no output
- `gh pr view 411`: `OPEN`, base `master`, head `feat/media-broker-4c-limit-as-20261125`. The PR body still says the ceiling is the same byte value as `MemoryMax`. That sentence describes `f5b286c`, before `7f1b66c` raised the constant to 32×. The test plan still leaves hosted Verify, the dual reviews, and the `003B-4C` / TASK-005 / HTTP close-out unchecked. This review does not edit that body and does not check those boxes
- worktree at review time was already `feat/media-broker-4c-limit-as-20261125` at `ca23f75174ed3a71ab1b4efabe1a52dfdd76449a`. No checkout
- untracked persist leftovers (`sdd/reviews/20261124-sol-pr365-*.md`, `20261124-sol-pr373-*.md`, `20261125-sol-pr376-*.md`, `20261125-sol-pr378-*.md`, `20261125-sol-pr380-*.md`, `20261125-sol-pr382-*.md`, `20261125-sol-pr384-*.md`, `20261125-sol-pr386-*.md`, `20261125-sol-pr388-*.md`, `20261125-sol-pr390-*.md`, `20261125-sol-pr392-*.md`, `20261125-sol-pr394-*.md`, `20261125-sol-pr396-*.md`, `20261125-sol-pr398-*.md`, `20261125-sol-pr400-*.md`, `20261125-sol-pr402-*.md`, `20261125-sol-pr404-*.md`, `20261125-sol-pr406-*.md`, `20261125-sol-pr408-*.md`, `20261125-sol-pr410-*.md`) are outside this three-dot diff and were not staged
- local cargo: not run. This host is Windows. The new PID 1 test is `#[ignore]` and runs in `media-broker-pid1`. Focused validation is hosted Verify `45743360147`
- Verify `45740191119` (`f5b286c`, rustfmt), `45740463043` (`de2321c`, `LimitAS` equal to `MemoryMax`), and `45743090850` (`7f1b66c`, clippy `doc_markdown` plus a Temurin catalog miss) are superseded. This review covers head `ca23f75174ed3a71ab1b4efabe1a52dfdd76449a` only, including all four commits
- this file is not a GitHub approval and does not mark `003B-4C` closed

## Job conclusions (Verify 45743360147)

`gh run view 45743360147`: event `pull_request`, name `Verify`, status `completed`, conclusion `success`, headSha `ca23f75174ed3a71ab1b4efabe1a52dfdd76449a`, `attempt` 2. `gh run list --commit ca23f75174ed3a71ab1b4efabe1a52dfdd76449a` returns that single Verify run. `gh pr checks 411` reports the same seven jobs `pass`. Attempt 2 jobs are all `completed` / `success`. None cancelled. Temurin was not retargeted. `.github/workflows/verify.yml` is not in the diff. `media-broker-pid1` stays `timeout-minutes: 40`. `java-version` stays `21.0.13+9` with `check-latest: false`. The successful pid1 log resolves Java from the tool-cache and pins `21.0.13+9-LTS` (`pinned java runtime 21.0.13+9-LTS vendor Eclipse Adoptium`).

Attempt 1 on the same SHA failed outside this diff and was rerun. `media-broker-pid1` `139653541449` failed in 9s (`2026-11-26T02:35:06Z`–`2026-11-26T02:35:15Z`) at `actions/setup-java`: `No matching version found for SemVer '21.0.13+9'` (Temurin-Hotspot catalog; the listed neighbor is `21.0.13+9.0.LTS`). Pin, package, Rust, and the PID 1 step were skipped. The other six attempt-1 jobs succeeded. Attempt 2 reran the failed job and finished `success`. The pin stays `21.0.13+9`.

- repository-hygiene `139657881131`: `completed` / `success` (12s, `2026-11-26T02:34:51Z`–`2026-11-26T02:35:03Z`)
- media-broker `139657922705`: `completed` / `success` (1m11s, `2026-11-26T02:35:06Z`–`2026-11-26T02:36:17Z`)
- frontend `139657918088`: `completed` / `success` (4m6s, `2026-11-26T02:35:05Z`–`2026-11-26T02:39:11Z`)
- productive-routes-real-e2e `139657928746`: `completed` / `success` (6m21s, `2026-11-26T02:35:05Z`–`2026-11-26T02:41:26Z`)
- unified-access-real-e2e `139657880987`: `completed` / `success` (6m6s, `2026-11-26T02:35:06Z`–`2026-11-26T02:41:12Z`)
- backend `139657934501`: `completed` / `success` (10m3s, `2026-11-26T02:35:06Z`–`2026-11-26T02:45:09Z`)
- media-broker-pid1 `139657879279`: `completed` / `success` (24m28s, `2026-11-26T02:47:17Z`–`2026-11-26T03:11:45Z`)

`media-broker` `139657922705` records `dbus::tests::derived_worker_limit_as_is_rlimit_not_cgroup ... ok` and `test result: ok. 76 passed; 0 failed; 29 ignored`. The new PID 1 test is ignored there. `media-broker-pid1` `139657879279` records `test dbus::tests::pid1_worker_limit_as ... ok` and `test result: ok. 29 passed; 0 failed; 0 ignored; 0 measured; 76 filtered out` (cargo time 1371.60s). A log filter for `core-dump`, `coredump`, `hs_err`, and `ENXIO` on that job matched 0 lines. The 40-minute timeout is unchanged harness time for those 29 PID 1 tests. It is not `Ready`.

Superseded runs, not evidence for this head:

- `45740191119` on `f5b286c` failed. `media-broker` `139643067803` stopped in rustfmt (`Diff in .../dbus.rs:353`). `media-broker-pid1` `139643067906` also exited 101.
- `45740463043` on `de2321c` still set `WORKER_LIMIT_AS = WORKER_MEMORY_MAX_BYTES`. `media-broker-pid1` `139644006670` finished `22 passed; 7 failed`. `pid1_worker_limit_as` was `ok`. The failure transcript records five units `Failed with result 'core-dump'`. The property read does not require the JVM to stay up. That is why the dedicated test passed while seven other PID 1 tests failed.
- `45743090850` on `7f1b66c` (32×, `HotSpot` still unbackticked) failed. `media-broker` `139652645218` stopped on clippy `doc_markdown` at the `HotSpot` doc line. `productive-routes-real-e2e` `139652645215` failed in `setup-java` with the same SemVer `21.0.13+9` catalog miss. `media-broker-pid1` `139652645123` was `success` on that older SHA. The head commit backticks the doc and rewords the assert string. It does not change the constant.

## Diff reviewed

`git diff fa840c08a707b18c4ac1c12f7eb9250dc94d9ecc...ca23f75174ed3a71ab1b4efabe1a52dfdd76449a`: 3 files, +118 / −12. Four commits, all in this review:

- `f5b286c04e1b7aec56e2756a0dec81db85dbdca6` adds `LimitAS` equal to `MemoryMax`, the derived test, and the ignored PID 1 test
- `de2321cf2757122b0b82cb0e1865c1f93ca5ebf0` rustfmt of the dbus test imports
- `7f1b66c7fd1baa4ac30e24bff9bd1d3fcdfac031` raises the constant to `32 * WORKER_MEMORY_MAX_BYTES` and records the core-dump reason in STATUS and progress
- `ca23f75174ed3a71ab1b4efabe1a52dfdd76449a` backticks `` `HotSpot` `` in the doc comment and changes the assert text from `HotSpot` to `the JVM`

| File | change |
| --- | --- |
| `backend/media-broker/src/dbus.rs` | `WORKER_LIMIT_AS` is `32 * WORKER_MEMORY_MAX_BYTES`. `worker_properties` sends `LimitAS` after `LimitCPU`. `derived_worker_limit_as_is_rlimit_not_cgroup` locks that key, inequality with `MemoryMax`, and the continued absence of `ProtectHome`, `RestrictAddressFamilies`, and `CPUQuota`. Ignored PID 1 test starts job `[0x1f; 16]` and reads `systemctl` `LimitAS` |
| `sdd/STATUS.md` | implementation banner is `4C RLIMIT AS del worker` and leaves `003B-4C` open. Remaining RLIMIT named are `LimitDATA` and `LimitSTACK`. The master section stays ProtectKernelModules PR #409 |
| `sdd/wip/.../4-implementation/progress.md` | same 32× claim. `003B-4C` is not marked. No socket family, global quota, `Ready`, or media HTTP |

`plan.md`, `spec.md`, `meta.md`, ADR-001, and `verify.yml` are not in the diff. No Kotlin, Angular, migration, fixture, lockfile, HTTP route, Java pin, timeout change, or secret.

## Why this cut

`003B-4C` in `plan.md` on this SHA is still `- [ ]` (line 89): harness Linux real con UID A/UID B, SELF_TEST/NORMALIZE dentro de la unidad, attestación efectiva de cgroup v2/mount/quota, aislamiento entre jobs, fallos y reinicios. `003B-4B-3` (line 84), `003B-4B-4` (line 87), `MEDIA-NORMALIZE-004` (line 93), and TASK-005 (line 16) stay `[ ]`. TASK-004 stays `[x]` and is a different checkbox. The technical spec (`2-technical/spec.md`, the `003B-4C` paragraph) still requires SELF_TEST/NORMALIZE, isolation, per-job and global quota, terminals without ACK, FD/mmap after the seal, OOM/timeout, cgroup termination, substitution rejection, and restart on every durable transition before that gate can close. It still says only `003B-4A+4B+4C` can complete `003B-4`, and HTTP stays outside this residual. ADR-001 still withholds `Ready` until namespaces, no AF_INET/AF_INET6, `CPUQuota`, and RLIMIT are effective, and the attestation list still includes RLIMIT. `meta.md` estado remains `implementation_in_progress` and its gate paragraph still ends on PR #409 `ProtectKernelModules`. The functional spec is outside the diff. This cut does not add media HTTP.

STATUS says this cut does not close `003B-4C`. It derives `LimitAS` at 32× the `IMAGE_IO_V1` heap (`RLIMIT_AS`) and attests that PID 1 reads it. A ceiling equal to `MemoryMax` core-dumps the JVM. `ProtectHome`, `CPUQuota`, and `RestrictAddressFamilies` stay out. Socket family, global quota, terminals without ACK, FD/mmap, restart on each durable transition, remaining RLIMIT (`LimitDATA`, `LimitSTACK`), and `Ready` stay absent. No media HTTP. `ProtectKernelModules` stays `true` from the previous cut.

The tree matches that claim. The opening GitHub summary does not: it still says the same byte ceiling as `MemoryMax`. The SHA under review is the 32× tree. This review does not check the PR test-plan boxes.

## Implementation

`WORKER_MEMORY_MAX_BYTES` remains `192 * 1024 * 1024`. `WORKER_LIMIT_AS` is `32 * WORKER_MEMORY_MAX_BYTES` (6,442,450,944 bytes, 6 GiB). The multiplication fits in `u64`. The constant is module-private. `worker_properties` takes only `&TransientUnits` and is the only worker property bag. It appends `("LimitAS", Value::from(WORKER_LIMIT_AS))` after `LimitCPU` and before `PrivateNetwork`. `MemoryMax` stays the separate cgroup property at `WORKER_MEMORY_MAX_BYTES`. `properties` sends the worker bag for `UnitKind::Worker` and does not send it for `UnitKind::Mount`. There is no new argument, spec field, or client property for this ceiling. The module comment still says the client never supplies a method name, unit name, `Where`, or `ExecStart`. `UnitKind` and `UnitState` stay the closed unit types, with `Unknown` at `from_wire`. `LimitAS` is not a new string state in a view.

`worker_properties` still does not set `ProtectHome`, `CPUQuota`, `RestrictAddressFamilies`, `LimitDATA`, or `LimitSTACK`. `LimitNOFILE`, `LimitNPROC`, `LimitCORE`, `LimitFSIZE`, `LimitCPU`, and `ProtectKernelModules` remain. `derived_worker_limit_as_is_rlimit_not_cgroup` builds a spec for in-process job `[0xab; 16]` and asserts `LimitAS` and `MemoryMax` are present, that `WORKER_LIMIT_AS` is not `WORKER_MEMORY_MAX_BYTES`, that the value debug form contains the constant's decimal, and that `ProtectHome`, `RestrictAddressFamilies`, and `CPUQuota` are absent. The factor `32` lives in the constant. The test follows that constant and rejects equality with the cgroup ceiling.

`pid1_worker_limit_as` is ignored unless `/proc/1/comm` is `systemd` and euid is 0. It derives job `[0x1f; 16]` and principal `2102:2102`, starts the mount, writes the existing `SELF_TEST` `request.bin`, and starts the worker through PID 1. `[0x1f; 16]` is not used by another PID 1 test (`[0x1e; 16]` stays on `pid1_worker_protect_kernel_modules`; `[0x1d; 16]` through `[0x10; 16]` stay on their existing cases). The `0x1f` byte inside `SELF_TEST_REQUEST` is payload, not a job id. If `StartTransientUnit` returns `Err`, the test panics that derived `LimitAS` was rejected. `systemctl show -p LimitAS --value` must equal the decimal constant or start with `expected:`. Stop of the worker and the mount accepts `Inactive` or `Failed`. The hosted job reached `ok`.

`start_transient` waits for `UnitState::is_active` and returns `Ok(Failed)` when the unit fails. The new test treats any `Ok` as acceptance, so a later core-dump can still leave the property readable. Verify `45740463043` showed that: `pid1_worker_limit_as` passed while seven other tests failed and five units recorded `core-dump`. On this head the same worker bag ran the whole ignored suite: `29 passed; 0 failed`, and the pid1 log has no `core-dump` line. That is the evidence the 32× ceiling let HotSpot map the JRE. The dedicated test itself remains a PID 1 property read.

`timeout-minutes: 40` is not touched. On this SHA the pid1 wall time is 24m28s and the cargo report is 1371.60s, both inside 40 minutes. Temurin stays `21.0.13+9`. The attempt-1 catalog miss was rerun. The workflow pin was not retargeted.

## Ledger

- `sdd/STATUS.md` banner is `4C RLIMIT AS del worker`. It says this cut does not close `003B-4C`. It names derived `LimitAS` at 32× the `IMAGE_IO_V1` heap and a PID 1 read. A ceiling equal to `MemoryMax` core-dumps the JVM. `ProtectHome`, `CPUQuota`, and `RestrictAddressFamilies` stay out. Socket family, global quota, terminals without ACK, FD/mmap, restart, remaining RLIMIT (`LimitDATA`, `LimitSTACK`), and `Ready` stay absent. `003B-4B-3`, `003B-4B-4`, `003B-4C`, `003B-4`, TASK-005, and #7 stay open. No media HTTP.
- The master section still records merged `77fbe292b26dfac7c8e22310392ad454f288817e` / PR #409 and `ProtectKernelModules=true`. It does not claim this unmerged head is master and does not close `003B-4C`.
- `progress.md` records the same 32× derivation, says the ceiling is not `MemoryMax` and not `CPUQuota`, and says `003B-4C` is not marked. No socket family, global quota, `Ready`, or media HTTP.
- `plan.md` is not in the diff. `MEDIA-NORMALIZE-003B-4C` remains `- [ ]` at line 89. `003B-4B-3`, `003B-4B-4`, `MEDIA-NORMALIZE-004`, and TASK-005 remain `[ ]`.

## Standards applied

`sdd/reviews/20261125-sol-pr409-architecture.md`: a PID 1 attest of one derived worker property stays inside the harness and leaves `003B-4C`, `Ready`, and HTTP open. The same boundary is the recorded pattern for one derived limit. The checkbox rule still applies: the canonical plan checkbox stays `[ ]` until the gate is actually done. Closed unit kinds stay `UnitKind` / `UnitState`. The change stays in the media-broker D-Bus adapter; it does not cross into a Kotlin port or an HTTP controller. Android architecture standards and the Spring/Kotlin backend standards do not apply to the behavior under review: the diff has no ViewModel, UiState, controller, or Kotlin change. ADR-001 still withholds `Ready` until the full namespace, address-family, `CPUQuota`, and RLIMIT set is effective, and still requires worker properties to be derived internally. `sdd/PATTERNS.md` still keeps the Kotlin domain free of framework types; this cut does not add a domain type or a wire translator. No new architecture gap: this is one derived `RLIMIT_AS` on the existing worker bag, set above `MemoryMax` so the JVM can map the runtime, with `003B-4C` left open.

## Gaps

No P0. No P1. No P2. No P3.

## Residuals (not findings)

- `003B-4B-3`, `003B-4B-4`, aggregate `003B-4B`, `003B-4C`, `003B-4`, `MEDIA-NORMALIZE-004`, TASK-005, and #7 stay open. No `Ready`, no catalog HTTP, no secrets, no deploy. This review does not check off `003B-4C`.
- `ProtectHome` stays unset after the earlier `ENXIO`. `CPUQuota` and `RestrictAddressFamilies` stay unset. This diff does not add them.
- Next residuals: global quota, terminals without ACK, FD/mmap after the seal, remaining RLIMIT (`LimitDATA`, `LimitSTACK`), and `Ready`. Socket family and restart on each durable transition stay out. This cut attests one derived address-space ceiling. It does not close `003B-4C`.
- The PID 1 attest reads `systemctl` `LimitAS`. It accepts `Ok(Failed)` from `start_transient`. It does not by itself prove the worker process stayed mapped. On this head the rest of the PID 1 suite passed with no `core-dump` line, which is the behavioral evidence the 1× ceiling lacked.
- The GitHub PR summary still says the ceiling matches `MemoryMax`. The head, STATUS, progress, and tests say 32×. This review does not edit the PR body.
- `meta.md` is outside the diff and still ends on the persisted #409 gate. It does not name head `ca23f75174ed3a71ab1b4efabe1a52dfdd76449a`. The implementation banner and progress carry this cut.
- Verify `45740191119`, `45740463043`, and `45743090850` are superseded and are not the pass for this head. Attempt 1 of `45743360147` is the Temurin catalog miss, not a reason to retarget `21.0.13+9`.
- This review file is not a GitHub approval, a merge, or a `Ready` declaration, and it does not mark `003B-4C` closed. No inject-ready claim. No media HTTP.

## Conclusion

Head `ca23f75174ed3a71ab1b4efabe1a52dfdd76449a` derives `LimitAS` as `32 * WORKER_MEMORY_MAX_BYTES` inside `worker_properties` and attests, on PID 1, that job `[0x1f; 16]` starts and `systemctl` reports that ceiling exactly or with an `expected:` prefix. The value is `RLIMIT_AS`, not `MemoryMax` and not `CPUQuota`. The client cannot supply it. `ProtectKernelModules` stays `true`. `ProtectHome`, `CPUQuota`, and `RestrictAddressFamilies` stay unset. `LimitDATA` and `LimitSTACK` stay unset. `media-broker-pid1` `timeout-minutes` stays 40. Temurin stays `21.0.13+9`. Verify `45743360147` is success 7/7 on this SHA, attempt 2, none cancelled. `media-broker-pid1` `139657879279` records `pid1_worker_limit_as ... ok` (`29 passed; 0 failed`) and no `core-dump` line. `media-broker` `139657922705` passed `derived_worker_limit_as_is_rlimit_not_cgroup` (`76 passed; 0 failed; 29 ignored`). `003B-4C`, `Ready`, HTTP, `003B-4B-3`, `003B-4B-4`, and TASK-005 stay open. Next residuals are global quota, terminals without ACK, FD/mmap, `LimitDATA`, `LimitSTACK`, and `Ready`. No inject-ready claim. No P0–P3. `APPROVED` for the architecture lane. This file is not a GitHub approval and does not mark `003B-4C` closed.
