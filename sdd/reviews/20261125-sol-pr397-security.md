VERDICT: APPROVED

## Evidence identity

- provider: xAI
- model: Grok 4.7
- effort: medium
- substitute-for: gpt-5.6-sol-medium (no quota)
- lane: security
- independent of the architecture lane; `sdd/reviews/20261125-sol-pr397-architecture.md` was not read
- PR: 397 OPEN `feat(media): attest PID 1 ProtectKernelTunables on the worker unit` https://github.com/AgustinFalcon/storecore/pull/397
- branch: `feat/media-broker-4c-protect-kernel-tunables-20261125`
- head: `8156b7c7def82711603395d80038dee904112502`
- base: `0394790691ab9b26e1d18d41afd8799c0ac2827c` (`origin/master`, persist #396 of LockPersonality #395)
- `git rev-parse HEAD`, `git rev-parse origin/master`, `git merge-base HEAD origin/master`, and `gh pr view 397` (`headRefOid` / `baseRefOid`) match those SHAs
- review range: `0394790691ab9b26e1d18d41afd8799c0ac2827c...8156b7c7def82711603395d80038dee904112502` (one commit, three files, +101/−9)
- Verify: `45661670755` `pull_request`, headSha `8156b7c7def82711603395d80038dee904112502`, current conclusion `success`, 7/7 `completed` / `success`, none cancelled
- prior pre-rebase Verify `45657233709` on `69ae2a4` is superseded; this review uses the current head only
- this file is not a GitHub approval
- this review does not close `003B-4C`, does not mark Ready, and does not add HTTP

## Job conclusions (Verify 45661670755)

Current run conclusion `success`. Event `pull_request`. No job cancelled. Seven jobs, each `completed` / `success`:

- repository-hygiene `139372850297`: `completed` / `success`
- productive-routes-real-e2e `139372974083`: `completed` / `success`
- backend `139372974134`: `completed` / `success`
- unified-access-real-e2e `139372974198`: `completed` / `success`
- media-broker-pid1 `139372974212`: `completed` / `success` (17:09:26Z–17:28:05Z, 18m39s)
- media-broker `139372974252`: `completed` / `success`
- frontend `139372974263`: `completed` / `success`

`media-broker-pid1` job `139372974212` log contains `test dbus::tests::pid1_worker_protect_kernel_tunables ... ok` and `test result: ok. 22 passed; 0 failed; 0 ignored; 0 measured; 69 filtered out`. That log has zero `ENXIO` lines. `StartTransientUnit` accepted the derived `ProtectKernelTunables` property.

`media-broker` job `139372974252` log contains `test dbus::tests::derived_worker_protect_kernel_tunables ... ok` and `test result: ok. 69 passed; 0 failed; 22 ignored`.

This review did not run `cargo` or the PID 1 harness on the Windows host. `git diff --check` on the three-dot range printed no whitespace errors. `plan.md` still has `- [ ] MEDIA-NORMALIZE-003B-4C` (line 89) and `- [ ] TASK-005` (line 16) and is not in the diff. PR body checkboxes for Verify, dual review, and “Do not mark `003B-4C` / TASK-005 / HTTP closed” stay open.

## Why this cut

PR body, `sdd/STATUS.md`, and progress say the harness derives `ProtectKernelTunables=true` and PID 1 reads it back. `ProtectHome`, `CPUQuota`, and `RestrictAddressFamilies` stay unset. Socket family, global quota, terminals without ACK, FD/mmap after the seal, restart on every durable transition, remaining RLIMIT, and Ready stay out. No media HTTP. The spec residual still requires a real UID A/UID B harness before `003B-4C` can close, and says no isolated sub-cut enables `Ready`. ADR-001 still requires namespaces, no AF_INET/AF_INET6, `CPUQuota`, RLIMIT, and effective attestation before `Ready`. The diff does not check off `003B-4C`, Ready, TASK-005, or HTTP.

`ProtectHome` stays unset because PR #389 recorded PID 1 `StartTransientUnit` `ENXIO` / unexpected message contents for that property, the same rejection class as `RestrictAddressFamilies` and `CPUQuota`. This cut does not put it back. The existing `pid1_worker_protect_home` assertion is outside the diff.

## Controls

- `worker_properties` appends `("ProtectKernelTunables", Value::from(true))`. The boolean is a literal in that function. `TransientUnits::derive` still takes only job id, mount root, principal, and approved runtime. `BrokerRequest` stays a fixed frame (operation, 16-byte job id, revision, 32-byte digest, size) with no property map. The client cannot supply `ProtectKernelTunables`.
- `StartTransientUnit` receives that derived vector and an empty auxiliary array. `properties` loads the worker vector only from `worker_properties`. Keys are `'static`. There is no client property bag.
- `ProtectKernelTunables=true` makes kernel tunables such as `/proc/sys` read-only for the unit. It is an effective-property attest read back from PID 1 (`systemctl show -p ProtectKernelTunables --value`). It is a unit property. It is not a mount, network, or user namespace, and it is not `Ready`.
- The unit test `derived_worker_protect_kernel_tunables` requires the key and requires its debug form to contain `true`. It also requires the property list to omit `ProtectHome`, `RestrictAddressFamilies`, and `CPUQuota`. The full `worker_properties` vector still does not set those three, and it does not set `MemoryDenyWriteExecute`, `PrivateUsers`, `ProtectControlGroups`, `ProtectHostname`, `RestrictSUIDSGID`, `ProtectClock`, `ProtectKernelLogs`, `ProtectKernelModules`, `LimitAS`, `LimitDATA`, or `LimitSTACK`.
- `pid1_worker_protect_kernel_tunables` is `#[cfg(test)]` and `#[ignore]`, requires `/proc/1/comm` = `systemd` and euid 0, derives the unit, and reads `systemctl show -p ProtectKernelTunables --value`. It accepts only `yes` or `true`. Job id `[0x18; 16]` is not reused by another PID 1 test. The harness then stops the worker and the mount. It does not set a capability, open HTTP, or mark the broker `Ready`.
- The three-dot diff is `backend/media-broker/src/dbus.rs`, `sdd/STATUS.md`, and the WIP progress note. No secrets, no media HTTP route, no Kotlin capability flag, no `CPUQuota`, no socket-family allowlist.

## Residuals (not findings)

`003B-4C` stays open. So do socket family, global quota, terminals without ACK, FD/mmap after the seal, restart on every durable transition, remaining RLIMIT (`LimitAS`, `LimitDATA`, `LimitSTACK`), `ProtectHome`, `CPUQuota`, `RestrictAddressFamilies`, the remaining namespace properties (`ProtectControlGroups`, `ProtectHostname`, `RestrictSUIDSGID`, `ProtectClock`, `ProtectKernelLogs`, `ProtectKernelModules`), `Ready`, and media HTTP. The PID 1 check reads the effective property. It does not write a kernel tunable from inside the worker and then prove the write failed. `PrivateNetwork=true` from the earlier cut is unchanged and is not a substitute for `RestrictAddressFamilies`. `ProtectKernelTunables` does not close those residuals.

## Findings

No P0. No P1. No P2. No P3.
