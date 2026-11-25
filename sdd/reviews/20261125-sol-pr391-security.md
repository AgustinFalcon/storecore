VERDICT: APPROVED

## Evidence identity

- provider: xAI
- model: Grok 4.7
- effort: medium
- substitute-for: gpt-5.6-sol-medium (no quota)
- lane: security
- independent of the architecture lane; `sdd/reviews/20261125-sol-pr391-architecture.md` was not read
- PR: 391 OPEN `feat(media): attest PID 1 PrivateDevices on the worker unit` https://github.com/AgustinFalcon/storecore/pull/391
- branch: `feat/media-broker-4c-private-devices-20261125`
- head: `d9d191399590618d45df860b6b8ea7b2605c1d4f`
- base: `0142ffdcd43fd78125f33911813d2ccb45d79638` (`origin/master`)
- `git rev-parse HEAD` and `git rev-parse origin/master` match those SHAs; merge-base is the base SHA
- three-dot diff `0142ffdcd43fd78125f33911813d2ccb45d79638...d9d191399590618d45df860b6b8ea7b2605c1d4f`: `backend/media-broker/src/dbus.rs`, `sdd/STATUS.md`, `sdd/wip/20261116-catalog-media-upload-and-variant-gallery/4-implementation/progress.md` (+100 / −8)
- Verify: `45635171309` `pull_request` exact-head 7/7 `completed` / `success`, none cancelled, headSha `d9d191399590618d45df860b6b8ea7b2605c1d4f`
- `git diff --check` on that range: clean
- `plan.md` `MEDIA-NORMALIZE-003B-4C` remains `[ ]`
- this file is not a GitHub approval
- this review does not close `003B-4C`, does not mark Ready, and does not add HTTP

## Job conclusions (Verify 45635171309)

headSha `d9d191399590618d45df860b6b8ea7b2605c1d4f`. Run conclusion `success`. Event `pull_request`. No job cancelled.

- repository-hygiene `139278550958`: `completed` / `success`
- backend `139278660761`: `completed` / `success`
- media-broker `139278661201`: `completed` / `success`
- media-broker-pid1 `139278660974`: `completed` / `success`
- frontend `139278660739`: `completed` / `success`
- productive-routes-real-e2e `139278724924`: `completed` / `success`
- unified-access-real-e2e `139278660571`: `completed` / `success`

`media-broker-pid1` log: `test dbus::tests::pid1_worker_private_devices ... ok`.

## Why this cut

`003B-4C` in `sdd/wip/20261116-catalog-media-upload-and-variant-gallery/2-technical/spec.md` is the real Linux gate (UID A/UID B, SELF_TEST/NORMALIZE, per-job and global quota, ACK-less terminals, FD/mmap after seal, restart on every durable transition, and the remaining RLIMIT set). Only 4A+4B+4C complete `003B-4`. HTTP stays outside that residual. `plan.md` still has `003B-4C`, `003B-4B-3`, `003B-4B-4`, and TASK-005 unchecked. The capability stays blocked until 4C.

PR body, `sdd/STATUS.md`, and `progress.md` say the same thing: the harness derives `PrivateDevices=true` and PID 1 reads it back. `ProtectHome`, `CPUQuota`, and `RestrictAddressFamilies` stay unset. Socket family, global quota, ACK, FD/mmap, remaining RLIMIT, and Ready stay out. No media HTTP. The diff does not check off `003B-4C`.

## Controls

- `PrivateDevices` is a boolean literal inside `worker_properties`. The function takes only `&TransientUnits`. `TransientUnits::derive` still takes job id, mount root, principal, and approved runtime. Callers cannot supply unit names, `Where`, or `ExecStart`. `BrokerRequest` is a fixed frame (operation, job id, revision, digest, size) with no property map, so the client cannot supply `PrivateDevices` or flip it off.
- `StartTransientUnit` is called with mode `fail`, that derived vector, and an empty auxiliary unit list. The new key is only on the worker vector. Mount properties are unchanged.
- The unit test `derived_worker_private_devices` requires the key and a value whose debug form contains `true`, and requires `ProtectHome`, `RestrictAddressFamilies`, and `CPUQuota` to be absent. Existing `NoNewPrivileges`, `ProtectSystem=strict`, `PrivateNetwork`, and `PrivateTmp` stay in the same vector.
- `pid1_worker_private_devices` is `#[cfg(test)]` and `#[ignore]`, requires euid 0 and PID 1 `systemd`, starts the derived mount and worker, then reads `systemctl show -p PrivateDevices --value` and accepts only `yes` or `true`. It then stops the worker and the mount. It does not set `ProtectHome`, `CPUQuota`, or `RestrictAddressFamilies`, does not mark Ready, and does not open an HTTP route.
- `PrivateDevices=true` is a restriction PID 1 applies (private `/dev` for the worker). It does not grant the worker a capability, a socket family, or a client-chosen device policy. The diff contains no secrets and no media HTTP.

## Residuals (not findings)

`003B-4C` stays open. Socket family, global quota, terminals without ACK, FD/mmap after seal, restart on every durable transition, remaining RLIMIT, `ProtectHome`, `CPUQuota`, `RestrictAddressFamilies`, Ready, HTTP, and the capability unblock are unchanged. The PID 1 check is the effective unit property, not an in-namespace probe of host device nodes and not a Ready attest. `start_transient` can return `Ok(Failed)`; this test treats that as a started unit and still requires the property read. That matches the written claim (PID 1 reads the derived property) and does not close the gate.

## Findings

No P0. No P1. No P2. No P3.
