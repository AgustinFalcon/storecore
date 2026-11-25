VERDICT: APPROVED

## Evidence identity

- provider: xAI
- model: Grok 4.7
- effort: medium
- substitute-for: gpt-5.6-sol-medium (no quota)
- lane: security
- independent of the architecture lane; `sdd/reviews/20261125-sol-pr407-architecture.md` was not read
- PR: 407 OPEN `feat(media): attest PID 1 ProtectKernelLogs on the worker unit` https://github.com/AgustinFalcon/storecore/pull/407
- branch: `feat/media-broker-4c-protect-kernel-logs-20261125`
- head: `0289b53dcdd3d83202b484b469afde7ca0183cc4`
- base: `3daa8eea05d61fa285161d8251bc3857253f4778` (`origin/master`)
- `git rev-parse HEAD`, `git rev-parse origin/master`, `git merge-base HEAD origin/master`, and `gh pr view 407` (`headRefOid` / `baseRefOid`) match those SHAs
- review range: `3daa8eea05d61fa285161d8251bc3857253f4778...0289b53dcdd3d83202b484b469afde7ca0183cc4` (one commit, three files, +100/−9)
- Verify: `45708331318` `pull_request`, attempt 1, headSha `0289b53dcdd3d83202b484b469afde7ca0183cc4`, current conclusion `success`, 7/7 `completed` / `success`, none cancelled
- prior pre-rebase SHA `77ca887` and Verify `45704373319` are superseded; this review uses `0289b53` only
- this file is not a GitHub approval
- this review does not close `003B-4C`, does not mark Ready, and does not add HTTP
- untracked review leftovers `365`..`406` are outside this three-dot diff and are not part of the reviewed change

## Job conclusions (Verify 45708331318)

Current run conclusion `success`. Event `pull_request`. Attempt 1. No job cancelled. Seven jobs, each `completed` / `success`:

- repository-hygiene `139535954138`: `completed` / `success`
- media-broker `139536072207`: `completed` / `success`
- unified-access-real-e2e `139536072291`: `completed` / `success`
- productive-routes-real-e2e `139536072360`: `completed` / `success`
- frontend `139536072260`: `completed` / `success`
- backend `139536072373`: `completed` / `success`
- media-broker-pid1 `139536072304`: `completed` / `success` (21:53:06Z–22:15:41Z, 22m35s)

`media-broker-pid1` job `139536072304` log contains `test dbus::tests::pid1_worker_protect_kernel_logs ... ok` and `test result: ok. 27 passed; 0 failed; 0 ignored; 0 measured; 74 filtered out`. That log has zero `ENXIO` lines. `StartTransientUnit` accepted the derived `ProtectKernelLogs` property. The job still runs the existing `Pin Temurin 21.0.13+9` step; this cut does not retarget that pin.

`media-broker` job `139536072207` log contains `test dbus::tests::derived_worker_protect_kernel_logs ... ok` and `test result: ok. 74 passed; 0 failed; 27 ignored; 0 measured; 0 filtered out`.

This review did not run `cargo` or the PID 1 harness on the Windows host. `git diff --check` on the three-dot range printed no whitespace errors. `sdd/wip/20261116-catalog-media-upload-and-variant-gallery/3-tasks/plan.md` still has `- [ ] TASK-005` (line 16) and `- [ ] MEDIA-NORMALIZE-003B-4C` (line 89) and is not in the diff. PR body checkboxes for Verify, dual review, and “Do not mark `003B-4C` / TASK-005 / HTTP closed” stay open.

## Why this cut

PR body, `sdd/STATUS.md`, and progress say the harness derives `ProtectKernelLogs=true` and PID 1 reads it back. `ProtectHome`, `CPUQuota`, and `RestrictAddressFamilies` stay unset. Socket family, global quota, terminals without ACK, FD/mmap after the seal, restart on every durable transition, remaining RLIMIT, and Ready stay out. No media HTTP. The spec residual still requires a real UID A/UID B harness before `003B-4C` can close. `MEDIA-NORMALIZE-003B-4` is the only aggregate cut that may return `Ready`; ADR-001 says the `003B-4B` sub-cuts do not enable `Ready` individually. The diff does not check off `003B-4C`, Ready, TASK-005, or HTTP.

`ProtectHome` stays unset because an earlier cut recorded PID 1 `StartTransientUnit` `ENXIO` / unexpected message contents for that property, the same rejection class as `RestrictAddressFamilies` and `CPUQuota`. This cut does not put it back. The existing `pid1_worker_protect_home` assertion is outside the diff.

## Controls

- `worker_properties` appends `("ProtectKernelLogs", Value::from(true))`. The boolean is a literal in that function. `TransientUnits::derive` still takes only job id, mount root, principal, and approved runtime. `BrokerRequest` stays a fixed frame (operation, 16-byte job id, revision, 32-byte digest, size) with no property map. The client cannot supply `ProtectKernelLogs`.
- `StartTransientUnit` receives that derived vector and an empty auxiliary array. `properties` loads the worker vector only from `worker_properties`. Keys are `'static`. There is no client property bag.
- `ProtectKernelLogs=true` is the systemd unit property that denies access to the kernel log ring buffer. The PID 1 check reads the effective property back (`systemctl show -p ProtectKernelLogs --value`) and accepts only `yes` or `true`. That boolean attest is not a kmsg write probe inside the worker: the harness does not open `/dev/kmsg`, `/proc/kmsg`, or the kernel core from the worker, and it does not call `syslog` or write `dmesg`. It is not a mount, network, or user namespace, and it is not `Ready`. Existing `PrivateDevices=true` is a different control and is not re-proven by this readback.
- The unit test `derived_worker_protect_kernel_logs` requires the key and requires its debug form to contain `true`. It also requires the property list to omit `ProtectHome`, `RestrictAddressFamilies`, and `CPUQuota`. The full `worker_properties` vector still does not set those three, and it does not set `MemoryDenyWriteExecute`, `PrivateUsers`, `ProtectKernelModules`, `LimitAS`, `LimitDATA`, or `LimitSTACK`.
- `pid1_worker_protect_kernel_logs` is `#[cfg(test)]` and `#[ignore]`, requires `/proc/1/comm` = `systemd` and euid 0, derives the unit, and reads `systemctl show -p ProtectKernelLogs --value`. It accepts only `yes` or `true`. Job id `[0x1d; 16]` is not reused by another PID 1 test. The harness then stops the worker and the mount. It does not write kernel logs, open HTTP, inject a client property, or mark the broker `Ready`.
- The three-dot diff is `backend/media-broker/src/dbus.rs`, `sdd/STATUS.md`, and the WIP progress note. No secrets, no media HTTP route, no Kotlin capability flag, no `CPUQuota`, no socket-family allowlist, and no Java pin change.

## Residuals (not findings)

`003B-4C` stays open. So do socket family, global quota, terminals without ACK, FD/mmap after the seal, restart on every durable transition, remaining RLIMIT (`LimitAS`, `LimitDATA`, `LimitSTACK`), `ProtectHome`, `CPUQuota`, `RestrictAddressFamilies`, the remaining namespace properties (`PrivateUsers`, `MemoryDenyWriteExecute`, `ProtectKernelModules`), `Ready`, and media HTTP. The PID 1 check reads the effective boolean. It does not attempt to read or write the kernel log from inside the worker and then prove the attempt failed. `PrivateNetwork=true` from the earlier cut is unchanged and is not a substitute for `RestrictAddressFamilies`. `PrivateDevices=true` is unchanged and is not a substitute for this property. `ProtectKernelLogs` does not close those residuals. STATUS names this cut and keeps `003B-4C` open; it does not enumerate every remaining namespace property. The PR body still says remaining namespaces stay out, and `plan.md` leaves `003B-4C` and TASK-005 unchecked.

## Findings

No P0. No P1. No P2. No P3.
