VERDICT: APPROVED

## Evidence identity

- provider: xAI
- model: Grok 4.7
- effort: medium
- substitute-for: gpt-5.6-sol-medium (no quota)
- lane: architecture
- independent of the security lane. This review did not read `sdd/reviews/20261126-sol-pr413-security.md`
- PR: 413 OPEN `feat(media): attest PID 1 LimitDATA on the worker unit` https://github.com/AgustinFalcon/storecore/pull/413
- branch: `feat/media-broker-4c-limit-data-20261126`
- head SHA: `af49a66c6a2237f0dda7a7f5983a9d36f1de185a` (`gh pr view 413` `headRefOid`; `git rev-parse HEAD`). Subject: `feat(media): attest PID 1 LimitDATA on the worker unit`
- base / `origin/master`: `88586bab44c1075b7770248e5c70dcda2f476b47` (`git rev-parse origin/master` and `git merge-base origin/master HEAD`). Commit subject: `docs: persist PR 411 dual Grok reviews without closing 4C (#412)`. Persist of #412 of LimitAS #411
- one commit on the merge-base: `af49a66c6a2237f0dda7a7f5983a9d36f1de185a`
- diff identity: `git diff --stat origin/master...af49a66c6a2237f0dda7a7f5983a9d36f1de185a` is 3 files, +117 / −13. `git diff --check` on that range exited 0 with no output
- `gh pr view 413`: `OPEN`, base `master`, head `feat/media-broker-4c-limit-data-20261126`. The PR body says `LimitDATA` is the same 32× `IMAGE_IO_V1` heap as `LimitAS`, that it is not `LimitAS` and not `MemoryMax`, and that `003B-4C` stays open. The test plan still leaves hosted Verify, the dual reviews, and the `003B-4C` / TASK-005 / HTTP close-out unchecked. This review does not edit that body and does not check those boxes
- worktree at review time was already `feat/media-broker-4c-limit-data-20261126` at `af49a66c6a2237f0dda7a7f5983a9d36f1de185a`. No checkout
- untracked persist leftovers (`sdd/reviews/20261124-sol-pr365-*.md` through `20261126-sol-pr412-*.md`, including `20261126-sol-pr412-architecture.md` and `20261126-sol-pr412-security.md`) are outside this three-dot diff and were not staged
- local cargo: not run. This host is Windows. The new PID 1 test is `#[ignore]` and runs in `media-broker-pid1`. Focused validation is hosted Verify `45839402157`
- this file is not a GitHub approval and does not mark `003B-4C` closed

## Job conclusions (Verify 45839402157)

`gh run view 45839402157`: event `pull_request`, name `Verify`, status `completed`, conclusion `success`, headSha `af49a66c6a2237f0dda7a7f5983a9d36f1de185a`, `attempt` 2. `gh run list --commit af49a66c6a2237f0dda7a7f5983a9d36f1de185a` returns that single Verify run. `gh pr checks 413` reports the same seven jobs `pass`. Attempt 2 jobs are all `completed` / `success`. None cancelled. Temurin was not retargeted. `.github/workflows/verify.yml` is not in the diff. `media-broker-pid1` stays `timeout-minutes: 40`. `java-version` stays `21.0.13+9` with `check-latest: false`. The successful pid1 log resolves Java from the tool-cache and pins `21.0.13+9-LTS` (`pinned java runtime 21.0.13+9-LTS vendor Eclipse Adoptium`).

Attempt 1 on the same SHA failed outside this diff and was rerun. `media-broker-pid1` `139976873330` failed in 6s (`2026-11-26T14:28:55Z`–`2026-11-26T14:29:01Z`), `backend` `139976873248` in 31s (`14:28:55Z`–`14:29:26Z`), `unified-access-real-e2e` `139976873067` in 17s (`14:28:55Z`–`14:29:12Z`), and `productive-routes-real-e2e` `139976873182` in 19s (`14:28:55Z`–`14:29:14Z`). Each stopped at `actions/setup-java`: `No matching version found for SemVer '21.0.13+9'` (Temurin-Hotspot catalog; the listed neighbor is `21.0.13+9.0.LTS`). Pin, package, Rust, and the PID 1 step were skipped on that pid1 job. `media-broker` and `frontend` succeeded on attempt 1. Attempt 2 reran the four failed jobs and finished `success`. The pin stays `21.0.13+9`.

Attempt 2 job records (`gh pr checks 413` and the attempt-2 jobs API). Hygiene, media-broker, and frontend keep the attempt-1 start/complete times under new job ids; they were not re-executed:

- repository-hygiene `139981755671`: `completed` / `success` (9s, `2026-11-26T14:28:44Z`–`2026-11-26T14:28:53Z`)
- media-broker `139981815906`: `completed` / `success` (1m11s, `2026-11-26T14:28:55Z`–`2026-11-26T14:30:06Z`)
- frontend `139981757438`: `completed` / `success` (6m0s, `2026-11-26T14:28:54Z`–`2026-11-26T14:34:54Z`)
- unified-access-real-e2e `139981753302`: `completed` / `success` (6m1s, `2026-11-26T14:37:17Z`–`2026-11-26T14:43:18Z`)
- productive-routes-real-e2e `139981753283`: `completed` / `success` (7m44s, `2026-11-26T14:37:16Z`–`2026-11-26T14:45:00Z`)
- backend `139981753333`: `completed` / `success` (9m52s, `2026-11-26T14:37:16Z`–`2026-11-26T14:47:08Z`)
- media-broker-pid1 `139981752902`: `completed` / `success` (24m38s, `2026-11-26T14:37:17Z`–`2026-11-26T15:01:55Z`)

`media-broker` `139981815906` records `dbus::tests::derived_worker_limit_data_is_rlimit_not_as ... ok` and `test result: ok. 77 passed; 0 failed; 30 ignored`. The new PID 1 test is ignored there. `media-broker-pid1` `139981752902` records `test dbus::tests::pid1_worker_limit_data ... ok` and `test result: ok. 30 passed; 0 failed; 0 ignored; 0 measured; 77 filtered out` (cargo time 1372.49s). A log filter for `core-dump`, `coredump`, `hs_err`, and `ENXIO` on that job matched 0 lines. The 40-minute timeout is unchanged harness time for those 30 PID 1 tests. It is not `Ready`.

## Diff reviewed

`git diff 88586bab44c1075b7770248e5c70dcda2f476b47...af49a66c6a2237f0dda7a7f5983a9d36f1de185a`: 3 files, +117 / −13. One commit:

- `af49a66c6a2237f0dda7a7f5983a9d36f1de185a` adds `LimitDATA` equal to `WORKER_LIMIT_AS`, the derived test, the ignored PID 1 test, and the STATUS/progress banner

| File | change |
| --- | --- |
| `backend/media-broker/src/dbus.rs` | `WORKER_LIMIT_DATA` is `WORKER_LIMIT_AS` (32× heap). `worker_properties` sends `LimitDATA` after `LimitAS`. `derived_worker_limit_data_is_rlimit_not_as` locks that key, inequality with `MemoryMax`, and the continued absence of `ProtectHome`, `RestrictAddressFamilies`, and `CPUQuota`. Ignored PID 1 test starts job `[0x20; 16]` and reads `systemctl` `LimitDATA` |
| `sdd/STATUS.md` | implementation banner is `4C RLIMIT DATA del worker` and leaves `003B-4C` open. Remaining RLIMIT named is `LimitSTACK`. The master section stays LimitAS PR #411 |
| `sdd/wip/.../4-implementation/progress.md` | same 32× claim. `003B-4C` is not marked. No socket family, global quota, `Ready`, or media HTTP |

`plan.md`, `spec.md`, `meta.md`, ADR-001, and `verify.yml` are not in the diff. No Kotlin, Angular, migration, fixture, lockfile, HTTP route, Java pin, timeout change, or secret.

## Why this cut

`003B-4C` in `plan.md` on this SHA is still `- [ ]` (line 89): harness Linux real con UID A/UID B, SELF_TEST/NORMALIZE dentro de la unidad, attestación efectiva de cgroup v2/mount/quota, aislamiento entre jobs, fallos y reinicios. `003B-4B-3` (line 84), `003B-4B-4` (line 87), `MEDIA-NORMALIZE-004` (line 93), and TASK-005 (line 16) stay `[ ]`. TASK-004 stays `[x]` and is a different checkbox. The technical spec (`2-technical/spec.md`, the `003B-4C` paragraph) still requires SELF_TEST/NORMALIZE, isolation, per-job and global quota, terminals without ACK, FD/mmap after the seal, OOM/timeout, cgroup termination, substitution rejection, and restart on every durable transition before that gate can close. It still says only `003B-4A+4B+4C` can complete `003B-4`, and HTTP stays outside this residual. ADR-001 still withholds `Ready` until namespaces, no AF_INET/AF_INET6, `CPUQuota`, and RLIMIT are effective, and the attestation list still includes RLIMIT. `meta.md` estado remains `implementation_in_progress` and its gate paragraph still ends on PR #411 `LimitAS`. The functional spec is outside the diff. This cut does not add media HTTP.

STATUS says this cut does not close `003B-4C`. It derives `LimitDATA` at the same 32× `IMAGE_IO_V1` heap as `LimitAS` (`RLIMIT_DATA`) and attests that PID 1 reads it. The property is not `LimitAS` and not `MemoryMax`. `ProtectHome`, `CPUQuota`, and `RestrictAddressFamilies` stay out. Socket family, global quota, terminals without ACK, FD/mmap, restart on each durable transition, remaining RLIMIT (`LimitSTACK`), and `Ready` stay absent. No media HTTP. `ProtectKernelModules` and `LimitAS` stay from the previous cuts.

The tree matches that claim. The GitHub summary matches the 32× tree. This review does not check the PR test-plan boxes.

## Implementation

`WORKER_MEMORY_MAX_BYTES` remains `192 * 1024 * 1024`. `WORKER_LIMIT_AS` remains `32 * WORKER_MEMORY_MAX_BYTES` (6,442,450,944 bytes, 6 GiB). `WORKER_LIMIT_DATA` is `WORKER_LIMIT_AS`, so the data-segment ceiling is that same byte value. The constant is module-private. `worker_properties` takes only `&TransientUnits` and is the only worker property bag. It appends `("LimitDATA", Value::from(WORKER_LIMIT_DATA))` after `LimitAS` and before `PrivateNetwork`. `MemoryMax` stays the separate cgroup property at `WORKER_MEMORY_MAX_BYTES`. `LimitAS` stays the address-space property. `properties` sends the worker bag for `UnitKind::Worker` and does not send it for `UnitKind::Mount`. There is no new argument, spec field, or client property for this ceiling. The module comment still says the client never supplies a method name, unit name, `Where`, or `ExecStart`. `UnitKind` and `UnitState` stay the closed unit types, with `Unknown` at `from_wire`. `LimitDATA` is not a new string state in a view.

`worker_properties` still does not set `ProtectHome`, `CPUQuota`, `RestrictAddressFamilies`, or `LimitSTACK`. `LimitNOFILE`, `LimitNPROC`, `LimitCORE`, `LimitFSIZE`, `LimitCPU`, `LimitAS`, and `ProtectKernelModules` remain. `derived_worker_limit_data_is_rlimit_not_as` builds a spec for in-process job `[0xab; 16]` and asserts `LimitDATA` and `LimitAS` are present, that `WORKER_LIMIT_DATA` is not `WORKER_MEMORY_MAX_BYTES`, that the value debug form contains the constant's decimal, and that `ProtectHome`, `RestrictAddressFamilies`, and `CPUQuota` are absent. The factor `32` lives in `WORKER_LIMIT_AS`. This constant aliases that value. The test follows that constant and rejects equality with the cgroup ceiling. It does not require the `LimitDATA` number to differ from `LimitAS`: the two properties share the ceiling and stay distinct keys.

`pid1_worker_limit_data` is ignored unless `/proc/1/comm` is `systemd` and euid is 0. It derives job `[0x20; 16]` and principal `2102:2102`, starts the mount, writes the existing `SELF_TEST` `request.bin`, and starts the worker through PID 1. `[0x20; 16]` is not used by another `JobId::create` (`[0x1f; 16]` stays on `pid1_worker_limit_as`). The `0x20` byte inside `SELF_TEST_REQUEST` is payload, not a job id. If `StartTransientUnit` returns `Err`, the test panics that derived `LimitDATA` was rejected. `systemctl show -p LimitDATA --value` must equal the decimal constant or start with `expected:`. Stop of the worker and the mount accepts `Inactive` or `Failed`. The hosted job reached `ok`.

`start_transient` waits for `UnitState::is_active` and returns `Ok(Failed)` when the unit fails. The new test treats any `Ok` as acceptance, so a later core-dump can still leave the property readable. On this head the same worker bag ran the whole ignored suite: `30 passed; 0 failed`, and the pid1 log has no `core-dump` line and no `ENXIO` line. The dedicated test itself remains a PID 1 property read.

`timeout-minutes: 40` is not touched. On this SHA the pid1 wall time is 24m38s and the cargo report is 1372.49s, both inside 40 minutes. Temurin stays `21.0.13+9`. The attempt-1 catalog miss was rerun. The workflow pin was not retargeted.

## Ledger

- `sdd/STATUS.md` banner is `4C RLIMIT DATA del worker`. It says this cut does not close `003B-4C`. It names derived `LimitDATA` at the same 32× heap as `LimitAS` and a PID 1 read. The property is not `LimitAS` and not `MemoryMax`. `ProtectHome`, `CPUQuota`, and `RestrictAddressFamilies` stay out. Socket family, global quota, terminals without ACK, FD/mmap, restart, remaining RLIMIT (`LimitSTACK`), and `Ready` stay absent. `003B-4B-3`, `003B-4B-4`, `003B-4C`, `003B-4`, TASK-005, and #7 stay open. No media HTTP.
- The master section still records merged `3aaced7ce133401286697a4c2a664646df1079fa` / PR #411 and `LimitAS` at 32×. It does not claim this unmerged head is master and does not close `003B-4C`.
- `progress.md` records the same 32× derivation, says the ceiling is not `LimitAS` and not `MemoryMax`, and says `003B-4C` is not marked. No socket family, global quota, `Ready`, or media HTTP.
- `plan.md` is not in the diff. `MEDIA-NORMALIZE-003B-4C` remains `- [ ]` at line 89. `003B-4B-3`, `003B-4B-4`, `MEDIA-NORMALIZE-004`, and TASK-005 remain `[ ]`.

## Standards applied

`sdd/reviews/20261126-sol-pr411-architecture.md`: a PID 1 attest of one derived worker property stays inside the harness and leaves `003B-4C`, `Ready`, and HTTP open. The same boundary is the recorded pattern for one derived limit. The checkbox rule still applies: the canonical plan checkbox stays `[ ]` until the gate is actually done. Closed unit kinds stay `UnitKind` / `UnitState`. The change stays in the media-broker D-Bus adapter; it does not cross into a Kotlin port or an HTTP controller. Android architecture standards and the Spring/Kotlin backend standards do not apply to the behavior under review: the diff has no ViewModel, UiState, controller, or Kotlin change. ADR-001 still withholds `Ready` until the full namespace, address-family, `CPUQuota`, and RLIMIT set is effective, and still requires worker properties to be derived internally. `sdd/PATTERNS.md` still keeps the Kotlin domain free of framework types; this cut does not add a domain type or a wire translator. No new architecture gap: this is one derived `RLIMIT_DATA` on the existing worker bag, set to the same 32× heap as `LimitAS` so `brk` stays inside that bound, with `003B-4C` left open.

## Gaps

No P0. No P1. No P2. No P3.

## Residuals (not findings)

- `003B-4B-3`, `003B-4B-4`, aggregate `003B-4B`, `003B-4C`, `003B-4`, `MEDIA-NORMALIZE-004`, TASK-005, and #7 stay open. No `Ready`, no catalog HTTP, no secrets, no deploy. This review does not check off `003B-4C`.
- `ProtectHome` stays unset after the earlier `ENXIO`. `CPUQuota` and `RestrictAddressFamilies` stay unset. This diff does not add them. The pid1 log on this head has no `ENXIO` line.
- Next residual: global quota, terminals without ACK, FD/mmap after the seal, remaining RLIMIT (`LimitSTACK`), and `Ready`. Socket family and restart on each durable transition stay out. This cut attests one derived data-segment ceiling. It does not close `003B-4C`.
- The PID 1 attest reads `systemctl` `LimitDATA`. It accepts `Ok(Failed)` from `start_transient`. It does not by itself prove the worker process stayed mapped. On this head the rest of the PID 1 suite passed with no `core-dump` line.
- `WORKER_LIMIT_DATA` equals `WORKER_LIMIT_AS`. The data-segment ceiling does not sit below the address-space ceiling. STATUS and the PR body state that shared 32× heap. The keys stay distinct.
- `meta.md` is outside the diff and still ends on the persisted #411 gate. It does not name head `af49a66c6a2237f0dda7a7f5983a9d36f1de185a`. The implementation banner and progress carry this cut.
- Attempt 1 of `45839402157` is the Temurin catalog miss on pid1, backend, unified, and productive, not a reason to retarget `21.0.13+9`.
- This review file is not a GitHub approval, a merge, or a `Ready` declaration, and it does not mark `003B-4C` closed. No inject-ready claim. No media HTTP.

## Conclusion

Head `af49a66c6a2237f0dda7a7f5983a9d36f1de185a` derives `LimitDATA` as `WORKER_LIMIT_AS` (`32 * WORKER_MEMORY_MAX_BYTES`) inside `worker_properties` and attests, on PID 1, that job `[0x20; 16]` starts and `systemctl` reports that ceiling exactly or with an `expected:` prefix. The value is `RLIMIT_DATA`, not `LimitAS` and not `MemoryMax`. The client cannot supply it. `ProtectKernelModules` stays `true`. `LimitAS` stays at the same 32× heap. `ProtectHome`, `CPUQuota`, and `RestrictAddressFamilies` stay unset. `LimitSTACK` stays unset. `media-broker-pid1` `timeout-minutes` stays 40. Temurin stays `21.0.13+9`. Verify `45839402157` is success 7/7 on this SHA, attempt 2, none cancelled. `media-broker-pid1` `139981752902` records `pid1_worker_limit_data ... ok` (`30 passed; 0 failed`) and no `core-dump` or `ENXIO` line. `media-broker` `139981815906` passed `derived_worker_limit_data_is_rlimit_not_as` (`77 passed; 0 failed; 30 ignored`). `003B-4C`, `Ready`, HTTP, `003B-4B-3`, `003B-4B-4`, and TASK-005 stay open. Next residual is global quota, terminals without ACK, FD/mmap, `LimitSTACK`, and `Ready`. No inject-ready claim. No P0–P3. `APPROVED` for the architecture lane. This file is not a GitHub approval and does not mark `003B-4C` closed.
