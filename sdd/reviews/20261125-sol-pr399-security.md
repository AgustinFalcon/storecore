VERDICT: APPROVED

## Evidence identity

- provider: xAI
- model: Grok 4.7
- effort: medium
- substitute-for: gpt-5.6-sol-medium (no quota)
- lane: security
- independent of the architecture lane; `sdd/reviews/20261125-sol-pr399-architecture.md` was not read
- PR: 399 OPEN `feat(media): attest PID 1 ProtectControlGroups on the worker unit` https://github.com/AgustinFalcon/storecore/pull/399
- branch: `feat/media-broker-4c-protect-control-groups-20261125`
- head: `b8ab5a36848c33ff7834ecd9637c85d9f4b6cb61`
- base: `b0a08a141e3b9c4067faa98949132a479f539d72` (`origin/master`, persist #398 of ProtectKernelTunables #397)
- `git rev-parse HEAD`, `git rev-parse origin/master`, `git merge-base HEAD origin/master`, and `gh pr view 399` (`headRefOid` / `baseRefOid`) match those SHAs
- review range: `b0a08a141e3b9c4067faa98949132a479f539d72...b8ab5a36848c33ff7834ecd9637c85d9f4b6cb61` (one commit, three files, +101/−9)
- Verify: `45674345804` `pull_request`, headSha `b8ab5a36848c33ff7834ecd9637c85d9f4b6cb61`, current conclusion `success`, 7/7 `completed` / `success`, none cancelled
- prior pre-rebase Verify `45665729714` on `6937daf287f266912b811970a1adf777938253e5` is superseded; this review uses the current head only
- this file is not a GitHub approval
- this review does not close `003B-4C`, does not mark Ready, and does not add HTTP

## Job conclusions (Verify 45674345804)

Current run conclusion `success`. Event `pull_request`. No job cancelled. Seven jobs, each `completed` / `success`:

- repository-hygiene `139417746801`: `completed` / `success`
- productive-routes-real-e2e `139417866814`: `completed` / `success`
- media-broker-pid1 `139417866865`: `completed` / `success` (18:21:55Z–18:41:44Z, 19m49s)
- unified-access-real-e2e `139417866909`: `completed` / `success`
- backend `139417867032`: `completed` / `success`
- media-broker `139417867087`: `completed` / `success`
- frontend `139417867125`: `completed` / `success`

`media-broker-pid1` job `139417866865` log contains `test dbus::tests::pid1_worker_protect_control_groups ... ok` and `test result: ok. 23 passed; 0 failed; 0 ignored; 0 measured; 70 filtered out`. That log has zero `ENXIO` lines. `StartTransientUnit` accepted the derived `ProtectControlGroups` property.

`media-broker` job `139417867087` log contains `test dbus::tests::derived_worker_protect_control_groups ... ok` and `test result: ok. 70 passed; 0 failed; 23 ignored`.

This review did not run `cargo` or the PID 1 harness on the Windows host. `git diff --check` on the three-dot range printed no whitespace errors. `plan.md` still has `- [ ] MEDIA-NORMALIZE-003B-4C` (line 89) and `- [ ] TASK-005` (line 16) and is not in the diff. PR body checkboxes for Verify, dual review, and “Do not mark `003B-4C` / TASK-005 / HTTP closed” stay open.

## Why this cut

PR body, `sdd/STATUS.md`, and progress say the harness derives `ProtectControlGroups=true` and PID 1 reads it back. `ProtectHome`, `CPUQuota`, and `RestrictAddressFamilies` stay unset. Socket family, global quota, terminals without ACK, FD/mmap after the seal, restart on every durable transition, remaining RLIMIT, and Ready stay out. No media HTTP. The spec residual still requires a real UID A/UID B harness before `003B-4C` can close, and says no isolated sub-cut enables `Ready`. ADR-001 still requires namespaces, no AF_INET/AF_INET6, `CPUQuota`, RLIMIT, and effective attestation before `Ready`. The diff does not check off `003B-4C`, Ready, TASK-005, or HTTP.

`ProtectHome` stays unset because PR #389 recorded PID 1 `StartTransientUnit` `ENXIO` / unexpected message contents for that property, the same rejection class as `RestrictAddressFamilies` and `CPUQuota`. This cut does not put it back. The existing `pid1_worker_protect_home` assertion is outside the diff.

## Controls

- `worker_properties` appends `("ProtectControlGroups", Value::from(true))`. The boolean is a literal in that function. `TransientUnits::derive` still takes only job id, mount root, principal, and approved runtime. `BrokerRequest` stays a fixed frame (operation, 16-byte job id, revision, 32-byte digest, size) with no property map. The client cannot supply `ProtectControlGroups`.
- `StartTransientUnit` receives that derived vector and an empty auxiliary array. `properties` loads the worker vector only from `worker_properties`. Keys are `'static`. There is no client property bag.
- `ProtectControlGroups=true` makes `/sys/fs/cgroup` read-only for the unit and blocks the unit from creating new cgroups. It is an effective-property attest read back from PID 1 (`systemctl show -p ProtectControlGroups --value`). It is a unit property. It is not a mount, network, or user namespace, and it is not `Ready`.
- The unit test `derived_worker_protect_control_groups` requires the key and requires its debug form to contain `true`. It also requires the property list to omit `ProtectHome`, `RestrictAddressFamilies`, and `CPUQuota`. The full `worker_properties` vector still does not set those three, and it does not set `MemoryDenyWriteExecute`, `PrivateUsers`, `ProtectHostname`, `RestrictSUIDSGID`, `ProtectClock`, `ProtectKernelLogs`, `ProtectKernelModules`, `LimitAS`, `LimitDATA`, or `LimitSTACK`.
- `pid1_worker_protect_control_groups` is `#[cfg(test)]` and `#[ignore]`, requires `/proc/1/comm` = `systemd` and euid 0, derives the unit, and reads `systemctl show -p ProtectControlGroups --value`. It accepts only `yes` or `true`. Job id `[0x19; 16]` is not reused by another PID 1 test. The harness then stops the worker and the mount. It does not set a capability, open HTTP, or mark the broker `Ready`.
- The three-dot diff is `backend/media-broker/src/dbus.rs`, `sdd/STATUS.md`, and the WIP progress note. No secrets, no media HTTP route, no Kotlin capability flag, no `CPUQuota`, no socket-family allowlist.

## Residuals (not findings)

`003B-4C` stays open. So do socket family, global quota, terminals without ACK, FD/mmap after the seal, restart on every durable transition, remaining RLIMIT (`LimitAS`, `LimitDATA`, `LimitSTACK`), `ProtectHome`, `CPUQuota`, `RestrictAddressFamilies`, the remaining namespace properties (`ProtectHostname`, `RestrictSUIDSGID`, `ProtectClock`, `ProtectKernelLogs`, `ProtectKernelModules`), `Ready`, and media HTTP. The PID 1 check reads the effective property. It does not write under `/sys/fs/cgroup` from inside the worker and then prove the write failed. `PrivateNetwork=true` from the earlier cut is unchanged and is not a substitute for `RestrictAddressFamilies`. `ProtectControlGroups` does not close those residuals.

## Findings

No P0. No P1. No P2. No P3.
