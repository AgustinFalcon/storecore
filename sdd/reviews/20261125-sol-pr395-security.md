VERDICT: APPROVED

## Evidence identity

- provider: xAI
- model: Grok 4.7
- effort: medium
- substitute-for: gpt-5.6-sol-medium (no quota)
- lane: security
- independent of the architecture lane
- PR: 395 OPEN `feat(media): attest PID 1 LockPersonality on the worker unit` https://github.com/AgustinFalcon/storecore/pull/395
- branch: `feat/media-broker-4c-lock-personality-20261125`
- head: `0cd6c93a03c83020626d0d10495ef8f8ccbf90ec`
- base: `4028b32cdd6af2f922fd1f23f87968d89f525ec9` (`origin/master`, persist #394 of RestrictRealtime #393)
- `git rev-parse HEAD`, `git rev-parse origin/master`, and `git merge-base HEAD origin/master` match those SHAs
- review range: `4028b32cdd6af2f922fd1f23f87968d89f525ec9...0cd6c93a03c83020626d0d10495ef8f8ccbf90ec` (one commit, three files, +100/−8)
- Verify: `45651635908` `pull_request`, headSha `0cd6c93a03c83020626d0d10495ef8f8ccbf90ec`, current conclusion `success`, 7/7 `completed` / `success`, none cancelled
- this file is not a GitHub approval
- this review does not close `003B-4C`, does not mark Ready, and does not add HTTP

## Job conclusions (Verify 45651635908)

Current run conclusion `success`. No job cancelled. Job ids after the failed-job rerun:

- repository-hygiene `139348981563`: `completed` / `success`
- backend `139348982463`: `completed` / `success`
- media-broker `139349045392`: `completed` / `success`
- media-broker-pid1 `139348982706`: `completed` / `success` (`run_attempt` 2, 16:11:23Z–16:31:55Z, 20m32s)
- frontend `139348983266`: `completed` / `success`
- productive-routes-real-e2e `139348979401`: `completed` / `success` (`run_attempt` 2, 16:32:20Z–16:38:25Z, 6m5s)
- unified-access-real-e2e `139348982087`: `completed` / `success`

Attempt 1 of the same run, same head SHA, concluded `failure`. Its jobs API recorded `media-broker-pid1` `139337466133` as `success` over the same window 16:11:23Z–16:31:55Z (20m32s). The only attempt-1 failure was `productive-routes-real-e2e` `139337466140`: `completed` / `failure` in ~22s (16:11:23Z–16:11:45Z). Step `actions/setup-java` failed before the pin step. The check annotation is `No matching version found for SemVer '21.0.13+9'` against catalog `21.0.13+9.0.LTS` (Temurin-Hotspot, jdk, x64). The rerun of that job passed. That failure is not `LockPersonality` and not `ENXIO`. This diff does not retarget the Java pin.

`media-broker-pid1` job `139348982706` log contains `test dbus::tests::pid1_worker_lock_personality ... ok` and `test result: ok. 21 passed; 0 failed`. That log has no `ENXIO` line. The jobs-log API returned the same bytes for attempt-1 job `139337466133` (SHA-256 `03cbb3824276f28e1443eb39cd757de235985ef011cd0256f766d2677766f770`), so the ok line is the first execution. `StartTransientUnit` accepted the derived property; the harness was not re-run after the Java flake.

`media-broker` job `139349045392` log contains `test dbus::tests::derived_worker_lock_personality ... ok` and `test result: ok. 68 passed; 0 failed; 21 ignored`.

This review did not run `cargo` or the PID 1 harness on the Windows host. `git diff --check` on the three-dot range printed no whitespace errors. `plan.md` still has `- [ ] MEDIA-NORMALIZE-003B-4C` (line 89) and `- [ ] TASK-005` (line 16) and is not in the diff.

## Why this cut

PR body, `sdd/STATUS.md`, and progress say the harness derives `LockPersonality=true` and PID 1 reads it back. `ProtectHome`, `CPUQuota`, and `RestrictAddressFamilies` stay unset. Socket family, global quota, terminals without ACK, FD/mmap after the seal, restart on every durable transition, remaining RLIMIT, and Ready stay out. No media HTTP. The spec residual still requires a real UID A/UID B harness before `003B-4C` can close, and says no isolated sub-cut enables `Ready`. ADR-001 still requires namespaces, no AF_INET/AF_INET6, `CPUQuota`, RLIMIT, and effective attestation before `Ready`. The diff does not check off `003B-4C`, Ready, TASK-005, or HTTP.

`ProtectHome` stays unset because PR #389 recorded PID 1 `StartTransientUnit` `ENXIO` / unexpected message contents for that property, the same rejection class as `RestrictAddressFamilies` and `CPUQuota`. This cut does not put it back.

## Controls

- `worker_properties` appends `("LockPersonality", Value::from(true))`. The boolean is a literal in that function. `TransientUnits::derive` still takes only job id, mount root, principal, and approved runtime. `BrokerRequest` stays a fixed frame (operation, 16-byte job id, revision, 32-byte digest, size) with no property map. The client cannot supply `LockPersonality`.
- `StartTransientUnit` receives that derived vector and an empty auxiliary array. Keys are `'static`. There is no client property bag.
- `LockPersonality=true` is systemd's lock of the `personality(2)` execution domain on the worker unit. It is an effective-property attest read back from PID 1 (`systemctl show -p LockPersonality --value`). It is a unit property, not a POSIX group, not a mount, network, or user namespace, and not `Ready`.
- The unit test `derived_worker_lock_personality` requires the key and requires its debug form to contain `true`. It also requires the property list to omit `ProtectHome`, `RestrictAddressFamilies`, and `CPUQuota`. The full `worker_properties` vector still does not set those three, and it does not set `MemoryDenyWriteExecute`, `PrivateUsers`, `ProtectKernelTunables`, `ProtectControlGroups`, `ProtectHostname`, `RestrictSUIDSGID`, `ProtectClock`, `ProtectKernelLogs`, `ProtectKernelModules`, `LimitAS`, `LimitDATA`, or `LimitSTACK`.
- `pid1_worker_lock_personality` is `#[cfg(test)]` and `#[ignore]`, requires `/proc/1/comm` = `systemd` and euid 0, derives the unit, and reads `systemctl show -p LockPersonality --value`. It accepts only `yes` or `true`. Job id `[0x17; 16]` is not reused by another PID 1 test. The harness then stops the worker and the mount. It does not set a capability, open HTTP, or mark the broker `Ready`.
- The three-dot diff is `backend/media-broker/src/dbus.rs`, `sdd/STATUS.md`, and the WIP progress note. No secrets, no media HTTP route, no Kotlin capability flag, no `CPUQuota`, no socket-family allowlist.

## Residuals (not findings)

`003B-4C` stays open. So do socket family, global quota, terminals without ACK, FD/mmap after the seal, restart on every durable transition, remaining RLIMIT (`LimitAS`, `LimitDATA`, `LimitSTACK`), `ProtectHome`, `CPUQuota`, `RestrictAddressFamilies`, the remaining namespace properties (`ProtectKernelTunables`, `ProtectControlGroups`, `ProtectHostname`, `RestrictSUIDSGID`, `ProtectClock`, `ProtectKernelLogs`, `ProtectKernelModules`), `Ready`, and media HTTP. The PID 1 check reads the effective property. It does not call `personality(2)` inside the worker. `PrivateNetwork=true` from the earlier cut is unchanged and is not a substitute for `RestrictAddressFamilies`. `LockPersonality` does not close those residuals.

## Findings

No P0. No P1. No P2. No P3.
