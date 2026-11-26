VERDICT: APPROVED

## Evidence identity

- provider: xAI
- model: Grok 4.7
- effort: medium
- substitute-for: gpt-5.6-sol-medium (no quota)
- lane: security
- independent of the architecture lane; `sdd/reviews/20261126-sol-pr416-architecture.md` was not read
- PR: 416 OPEN `feat(media): attest PID 1 LimitSTACK on the worker unit` https://github.com/AgustinFalcon/storecore/pull/416
- branch: `feat/media-broker-4c-limit-stack-20261126`
- head: `037fadb1429a4b39bff79c95cdbba1fe2cbe1e9a`
- base: `52922f5edd043d73563bba43467dab58613fbab9` (`origin/master`)
- `git rev-parse HEAD`, `git rev-parse origin/master`, `git merge-base HEAD origin/master`, and `gh pr view 416` (`headRefOid` / `baseRefOid`) match those SHAs
- review range: `52922f5edd043d73563bba43467dab58613fbab9...037fadb1429a4b39bff79c95cdbba1fe2cbe1e9a` (one commit `037fadb`, three files, +110/−12)
- files: `backend/media-broker/src/dbus.rs`, `sdd/STATUS.md`, `sdd/wip/20261116-catalog-media-upload-and-variant-gallery/4-implementation/progress.md`
- Verify: `45866580240` `pull_request`, attempt 1, headSha `037fadb1429a4b39bff79c95cdbba1fe2cbe1e9a`, current conclusion `success`, 7/7 `completed` / `success`, none cancelled
- superseded evidence is not this conclusion: pre-rebase head `a875ac7f4e967f35e75224fa6722ab8cd0b1aba7` and Verify `45858025897` (attempt 2, `success` on that older SHA). This review uses `45866580240` attempt 1 on `037fadb` only. The pid1 log on this head has no `core-dump` and no `ENXIO`
- this file is not a GitHub approval
- this review does not close `003B-4C`, does not mark Ready, and does not add HTTP

## Job conclusions (Verify 45866580240)

Current run conclusion `success`. Event `pull_request`. Attempt 1. No job cancelled. Seven jobs, each `completed` / `success`:

- repository-hygiene `140070833262`: `completed` / `success`
- media-broker `140070948604`: `completed` / `success`
- unified-access-real-e2e `140070948499`: `completed` / `success`
- productive-routes-real-e2e `140070948465`: `completed` / `success`
- frontend `140070948682`: `completed` / `success`
- backend `140070948435`: `completed` / `success`
- media-broker-pid1 `140070948425`: `completed` / `success` (17:18:32Z–17:45:07Z, 26m35s)

`media-broker-pid1` job `140070948425` log contains `test dbus::tests::pid1_worker_limit_stack ... ok` and `test result: ok. 31 passed; 0 failed; 0 ignored; 0 measured; 78 filtered out`. That log has zero `ENXIO` lines and zero `core-dump` lines. `StartTransientUnit` accepted the derived `LimitSTACK` property. The job still runs the existing `Pin Temurin 21.0.13+9` step (`pinned java runtime 21.0.13+9-LTS`); this cut does not retarget that pin. `.github/workflows/verify.yml` is not in the three-dot diff.

`media-broker` job `140070948604` log contains `test dbus::tests::derived_worker_limit_stack_is_rlimit ... ok` and `test result: ok. 78 passed; 0 failed; 31 ignored; 0 measured; 0 filtered out`.

This head sets `LimitSTACK` to `8 * 1024 * 1024` (`8388608` bytes). `LimitAS` stays `32 * WORKER_MEMORY_MAX_BYTES` (`6442450944` bytes). `MemoryMax` stays `192 * 1024 * 1024`. The pid1 log does not show `core-dump`.

This review did not run `cargo` or the PID 1 harness on the Windows host. `git diff --check` on the three-dot range printed no whitespace errors. `sdd/wip/20261116-catalog-media-upload-and-variant-gallery/3-tasks/plan.md` still has `- [ ] TASK-005` (line 16) and `- [ ] MEDIA-NORMALIZE-003B-4C` (line 89) and is not in the diff. PR body checkboxes for Verify, dual review, and “Do not mark `003B-4C` / TASK-005 / HTTP closed” stay open.

## Why this cut

PR body, `sdd/STATUS.md`, progress, and ADR-001 say the harness derives one more RLIMIT and PID 1 reads it back. ADR-001 still requires effective RLIMIT attestation before `003B-4C` can close, and it says no `003B-4B` sub-cut enables `Ready` by itself. The spec residual still requires a real UID A/UID B harness (SELF_TEST/NORMALIZE, per-job and global quota, terminals without ACK, FD/mmap after the seal, OOM/timeout, cgroup termination, substitution rejection, restart on every durable transition). The diff does not check off `003B-4C`, Ready, TASK-005, or HTTP.

`ProtectHome`, `CPUQuota`, and `RestrictAddressFamilies` stay unset. An earlier cut recorded PID 1 `StartTransientUnit` `ENXIO` / unexpected message contents for that class of property. This cut does not put them back. `PrivateUsers` and `MemoryDenyWriteExecute` stay out.

## Security ledger

- `WORKER_LIMIT_STACK` is `8 * 1024 * 1024` (`8388608` bytes). `worker_properties` appends `("LimitSTACK", Value::from(WORKER_LIMIT_STACK))` beside the unchanged `("LimitAS", Value::from(WORKER_LIMIT_AS))`, `("LimitDATA", Value::from(WORKER_LIMIT_DATA))`, and `("MemoryMax", Value::from(WORKER_MEMORY_MAX_BYTES))`. `LimitSTACK` is `RLIMIT_STACK`. It is not `LimitAS`, not `LimitDATA`, and not `MemoryMax`. The stack ceiling does not raise the address-space ceiling and does not replace it. `MemoryMax` remains the cgroup RSS cap of 192 MiB.
- The byte ceiling is a literal in `worker_properties`. `TransientUnits::derive` still takes only job id, mount root, principal, and approved runtime. `BrokerRequest` stays a fixed frame (operation, 16-byte job id, revision, 32-byte digest, size) with no property map. The client cannot supply `LimitSTACK`.
- `StartTransientUnit` receives that derived vector and an empty auxiliary array. `properties` loads the worker vector only from `worker_properties`. Keys are `'static`. There is no client property bag.
- The PID 1 check reads the effective property back (`systemctl show -p LimitSTACK`). It accepts the derived decimal or the soft:hard form that starts with that decimal, the same predicate already used for `LimitDATA`, `LimitAS`, `LimitCPU`, and `LimitFSIZE`. Job id `[0x21; 16]` is not reused by another PID 1 test. The harness then stops the worker and the mount. It does not open HTTP, inject a client property, or mark the broker `Ready`. The readback is the unit property, not `getrlimit` inside the JVM.
- `derived_worker_limit_stack_is_rlimit` requires `LimitSTACK` at the internal 8 MiB ceiling and requires the property list to omit `ProtectHome`, `RestrictAddressFamilies`, and `CPUQuota`. The full `worker_properties` vector still does not set those three. It also does not set `PrivateUsers` or `MemoryDenyWriteExecute`.
- `pid1_worker_limit_stack` is `#[cfg(test)]` and `#[ignore]`, and it requires `/proc/1/comm` = `systemd` and euid 0. On this head that test passed under PID 1.
- The three-dot diff is `dbus.rs`, `sdd/STATUS.md`, and the WIP progress note. No secrets, no media HTTP route, no Kotlin capability flag, no `CPUQuota`, no socket-family allowlist, and no Java pin change.

## Gaps

`003B-4C` stays open. So do socket family, global quota, terminals without ACK, FD/mmap after the seal, restart on every durable transition, `ProtectHome`, `CPUQuota`, `RestrictAddressFamilies`, `PrivateUsers`, `MemoryDenyWriteExecute`, `Ready`, and media HTTP. `LimitSTACK` does not close those residuals. The PID 1 check does not call `getrlimit` in the worker. STATUS names this cut and keeps `003B-4C` open. `plan.md` leaves `003B-4C` and TASK-005 unchecked. This review does not check them off.

## Findings

No P0. No P1. No P2. No P3.

## Verdict

APPROVED for head `037fadb1429a4b39bff79c95cdbba1fe2cbe1e9a`. Verify attempt 1 `45866580240` is 7/7 on that head. `003B-4C` stays open.
