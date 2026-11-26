VERDICT: APPROVED

## Evidence identity

- provider: xAI
- model: Grok 4.7
- effort: medium
- substitute-for: gpt-5.6-sol-medium (no quota)
- lane: security
- independent of the architecture lane; `sdd/reviews/20261126-sol-pr411-architecture.md` was not read
- PR: 411 OPEN `feat(media): attest PID 1 LimitAS on the worker unit` https://github.com/AgustinFalcon/storecore/pull/411
- branch: `feat/media-broker-4c-limit-as-20261125`
- head: `ca23f75174ed3a71ab1b4efabe1a52dfdd76449a`
- base: `fa840c08a707b18c4ac1c12f7eb9250dc94d9ecc` (`origin/master`, persist #410)
- `git rev-parse HEAD`, `git rev-parse origin/master`, `git merge-base HEAD origin/master`, and `gh pr view 411` (`headRefOid` / `baseRefOid`) match those SHAs
- review range: `fa840c08a707b18c4ac1c12f7eb9250dc94d9ecc...ca23f75174ed3a71ab1b4efabe1a52dfdd76449a` (four commits, `f5b286c` then `de2321c` then `7f1b66c` then `ca23f75` clippy backticks, three files, +118/−12)
- files: `backend/media-broker/src/dbus.rs`, `sdd/STATUS.md`, `sdd/wip/20261116-catalog-media-upload-and-variant-gallery/4-implementation/progress.md`
- Verify: `45743360147` `pull_request`, attempt 2, headSha `ca23f75174ed3a71ab1b4efabe1a52dfdd76449a`, current conclusion `success`, 7/7 `completed` / `success`, none cancelled
- superseded evidence is not this head: attempt 1 of `45743360147` is the Temurin SemVer miss; run `45740463043` is `de2321c` with `LimitAS` equal to `MemoryMax`. This review uses `ca23f75` only (32× heap)
- this file is not a GitHub approval
- this review does not close `003B-4C`, does not mark Ready, and does not add HTTP

## Job conclusions (Verify 45743360147)

Current run conclusion `success`. Event `pull_request`. Attempt 2. No job cancelled. Seven jobs, each `completed` / `success`:

- repository-hygiene `139657881131`: `completed` / `success`
- media-broker `139657922705`: `completed` / `success`
- unified-access-real-e2e `139657880987`: `completed` / `success`
- productive-routes-real-e2e `139657928746`: `completed` / `success`
- frontend `139657918088`: `completed` / `success`
- backend `139657934501`: `completed` / `success`
- media-broker-pid1 `139657879279`: `completed` / `success` (02:47:17Z–03:11:45Z, 24m28s)

`media-broker-pid1` job `139657879279` log contains `test dbus::tests::pid1_worker_limit_as ... ok` and `test result: ok. 29 passed; 0 failed; 0 ignored; 0 measured; 76 filtered out`. That log has zero `ENXIO` lines. `StartTransientUnit` accepted the derived `LimitAS` property. The job still runs the existing `Pin Temurin 21.0.13+9` step; this cut does not retarget that pin. `.github/workflows/verify.yml` is not in the three-dot diff.

`media-broker` job `139657922705` log contains `test dbus::tests::derived_worker_limit_as_is_rlimit_not_cgroup ... ok` and `test result: ok. 76 passed; 0 failed; 29 ignored; 0 measured; 0 filtered out`.

Attempt 1 of the same run is not the reviewed conclusion. `media-broker-pid1` failed in `setup-java` with `No matching version found for SemVer '21.0.13+9'` (Temurin catalog lists `21.0.13+9.0.LTS`). The other six jobs succeeded on attempt 1. The rerun is attempt 2. The workflow pin stayed `21.0.13+9`. That flake is not a sandbox or pin change in this diff.

Run `45740463043` is head `de2321cf2757122b0b82cb0e1865c1f93ca5ebf0`, before the 32× commit. Its `media-broker-pid1` job `139644006670` logged `test dbus::tests::pid1_worker_limit_as ... ok` and then `Failed with result 'core-dump'` on the worker units, ending `22 passed; 7 failed`. The property was applied. An address-space ceiling equal to `MemoryMax` core-dumps the JVM because virtual size exceeds RSS. That is evidence the rlimit was enforced. It is not a sandbox weakening and it is not the reviewed head. `MemoryMax` stays `192 * 1024 * 1024`. This head sets `LimitAS` to `32 * WORKER_MEMORY_MAX_BYTES` (`6442450944` bytes).

This review did not run `cargo` or the PID 1 harness on the Windows host. `git diff --check` on the three-dot range printed no whitespace errors. `sdd/wip/20261116-catalog-media-upload-and-variant-gallery/3-tasks/plan.md` still has `- [ ] TASK-005` (line 16) and `- [ ] MEDIA-NORMALIZE-003B-4C` (line 89) and is not in the diff. PR body checkboxes for Verify, dual review, and “Do not mark `003B-4C` / TASK-005 / HTTP closed” stay open.

## Why this cut

PR body, `sdd/STATUS.md`, progress, and ADR-001 say the harness derives one more RLIMIT and PID 1 reads it back. ADR-001 still requires effective RLIMIT attestation before `003B-4C` can close, and it says no `003B-4B` sub-cut enables `Ready` by itself. The spec residual still requires a real UID A/UID B harness (SELF_TEST/NORMALIZE, per-job and global quota, terminals without ACK, FD/mmap after the seal, OOM/timeout, cgroup termination, substitution rejection, restart on every durable transition). The diff does not check off `003B-4C`, Ready, TASK-005, or HTTP.

`ProtectHome`, `CPUQuota`, and `RestrictAddressFamilies` stay unset. An earlier cut recorded PID 1 `StartTransientUnit` `ENXIO` / unexpected message contents for that class of property. This cut does not put them back.

## Security ledger

- `WORKER_LIMIT_AS` is `32 * WORKER_MEMORY_MAX_BYTES`. `worker_properties` appends `("LimitAS", Value::from(WORKER_LIMIT_AS))` beside the unchanged `("MemoryMax", Value::from(WORKER_MEMORY_MAX_BYTES))`. The comment and the unit test require the two ceilings to differ. `LimitAS` is `RLIMIT_AS`. It is not `MemoryMax` and it is not `CPUQuota`. `MemoryMax` remains the cgroup RSS cap of 192 MiB. The 32× virtual ceiling is what lets HotSpot map the JRE while staying bounded. The 1× core-dump on `de2321c` shows the rlimit was live; raising it on this head does not remove `MemoryMax`, `MemorySwapMax=0`, or `LimitCORE=0`.
- The byte ceiling is a literal in `worker_properties`. `TransientUnits::derive` still takes only job id, mount root, principal, and approved runtime. `BrokerRequest` stays a fixed frame (operation, 16-byte job id, revision, 32-byte digest, size) with no property map. The client cannot supply `LimitAS`.
- `StartTransientUnit` receives that derived vector and an empty auxiliary array. `properties` loads the worker vector only from `worker_properties`. Keys are `'static`. There is no client property bag.
- The PID 1 check reads the effective property back (`systemctl show -p LimitAS`). It accepts the derived decimal or the soft:hard form that starts with that decimal, the same predicate already used for `LimitCPU` and `LimitFSIZE`. Job id `[0x1f; 16]` is not reused by another PID 1 test. The harness then stops the worker and the mount. It does not open HTTP, inject a client property, or mark the broker `Ready`. The readback is the unit property, not `getrlimit` inside the JVM.
- `derived_worker_limit_as_is_rlimit_not_cgroup` requires `LimitAS` and `MemoryMax`, requires `LimitAS` to exceed `MemoryMax`, and requires the property list to omit `ProtectHome`, `RestrictAddressFamilies`, and `CPUQuota`. The full `worker_properties` vector still does not set those three. It also does not set `PrivateUsers`, `MemoryDenyWriteExecute`, `LimitDATA`, or `LimitSTACK`.
- `pid1_worker_limit_as` is `#[cfg(test)]` and `#[ignore]`, and it requires `/proc/1/comm` = `systemd` and euid 0. On this head that test passed under PID 1.
- The three-dot diff is `dbus.rs`, `sdd/STATUS.md`, and the WIP progress note. No secrets, no media HTTP route, no Kotlin capability flag, no `CPUQuota`, no socket-family allowlist, and no Java pin change.

## Gaps

`003B-4C` stays open. So do socket family, global quota, terminals without ACK, FD/mmap after the seal, restart on every durable transition, remaining RLIMIT (`LimitDATA`, `LimitSTACK`), `ProtectHome`, `CPUQuota`, `RestrictAddressFamilies`, `PrivateUsers`, `MemoryDenyWriteExecute`, `Ready`, and media HTTP. `LimitAS` does not close those residuals. The PID 1 check does not call `getrlimit` in the worker. STATUS names this cut and keeps `003B-4C` open. `plan.md` leaves `003B-4C` and TASK-005 unchecked. This review does not check them off.

## Findings

No P0. No P1. No P2. No P3.

## Verdict

APPROVED for head `ca23f75174ed3a71ab1b4efabe1a52dfdd76449a`. Verify attempt 2 `45743360147` is 7/7 on that head. `003B-4C` stays open.
