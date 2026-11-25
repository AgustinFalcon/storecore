VERDICT: APPROVED

## Evidence identity

- provider: xAI
- model: Grok 4.7
- effort: medium
- substitute-for: gpt-5.6-sol-medium (no quota)
- lane: security
- independent of the architecture lane; `sdd/reviews/20261125-sol-pr405-architecture.md` was not read
- PR: 405 OPEN `feat(media): attest PID 1 ProtectClock on the worker unit` https://github.com/AgustinFalcon/storecore/pull/405
- branch: `feat/media-broker-4c-protect-clock-20261125`
- head: `8cebbfcbaf9f6c4cf0dc76f1709b2e1c02ddfb76`
- base: `c58edd92386efe50065256f90816423c133d8a5a` (`origin/master`)
- `git rev-parse HEAD`, `git rev-parse origin/master`, `git merge-base HEAD origin/master`, and `gh pr view 405` (`headRefOid` / `baseRefOid`) match those SHAs
- review range: `c58edd92386efe50065256f90816423c133d8a5a...8cebbfcbaf9f6c4cf0dc76f1709b2e1c02ddfb76` (one commit, three files, +100/−9)
- Verify: `45699737406` `pull_request`, attempt 1, headSha `8cebbfcbaf9f6c4cf0dc76f1709b2e1c02ddfb76`, current conclusion `success`, 7/7 `completed` / `success`, none cancelled
- prior pre-rebase SHA `ef125f4` and Verify `45695578990` are superseded; this review uses `8cebbfc` only
- this file is not a GitHub approval
- this review does not close `003B-4C`, does not mark Ready, and does not add HTTP
- untracked review leftovers `365`..`404` are outside this three-dot diff and are not part of the reviewed change

## Job conclusions (Verify 45699737406)

Current run conclusion `success`. Event `pull_request`. Attempt 1. No job cancelled. Seven jobs, each `completed` / `success`:

- repository-hygiene `139506379600`: `completed` / `success`
- media-broker `139506541174`: `completed` / `success`
- unified-access-real-e2e `139506541197`: `completed` / `success`
- productive-routes-real-e2e `139506541223`: `completed` / `success`
- frontend `139506541232`: `completed` / `success`
- backend `139506541256`: `completed` / `success`
- media-broker-pid1 `139506541334`: `completed` / `success` (20:57:05Z–21:19:46Z, 22m41s)

`media-broker-pid1` job `139506541334` log contains `test dbus::tests::pid1_worker_protect_clock ... ok` and `test result: ok. 26 passed; 0 failed; 0 ignored; 0 measured; 73 filtered out`. That log has zero `ENXIO` lines. `StartTransientUnit` accepted the derived `ProtectClock` property. The job still runs the existing `Pin Temurin 21.0.13+9` step; this cut does not retarget that pin.

`media-broker` job `139506541174` log contains `test dbus::tests::derived_worker_protect_clock ... ok` and `test result: ok. 73 passed; 0 failed; 26 ignored; 0 measured; 0 filtered out`.

This review did not run `cargo` or the PID 1 harness on the Windows host. `git diff --check` on the three-dot range printed no whitespace errors. `sdd/wip/20261116-catalog-media-upload-and-variant-gallery/3-tasks/plan.md` still has `- [ ] TASK-005` (line 16) and `- [ ] MEDIA-NORMALIZE-003B-4C` (line 89) and is not in the diff. PR body checkboxes for Verify, dual review, and “Do not mark `003B-4C` / TASK-005 / HTTP closed” stay open.

## Why this cut

PR body, `sdd/STATUS.md`, and progress say the harness derives `ProtectClock=true` and PID 1 reads it back. `ProtectHome`, `CPUQuota`, and `RestrictAddressFamilies` stay unset. Socket family, global quota, terminals without ACK, FD/mmap after the seal, restart on every durable transition, remaining RLIMIT, and Ready stay out. No media HTTP. The spec residual still requires a real UID A/UID B harness before `003B-4C` can close, and says no isolated sub-cut enables `Ready`. The diff does not check off `003B-4C`, Ready, TASK-005, or HTTP.

`ProtectHome` stays unset because an earlier cut recorded PID 1 `StartTransientUnit` `ENXIO` / unexpected message contents for that property, the same rejection class as `RestrictAddressFamilies` and `CPUQuota`. This cut does not put it back. The existing `pid1_worker_protect_home` assertion is outside the diff.

## Controls

- `worker_properties` appends `("ProtectClock", Value::from(true))`. The boolean is a literal in that function. `TransientUnits::derive` still takes only job id, mount root, principal, and approved runtime. `BrokerRequest` stays a fixed frame (operation, 16-byte job id, revision, 32-byte digest, size) with no property map. The client cannot supply `ProtectClock`.
- `StartTransientUnit` receives that derived vector and an empty auxiliary array. `properties` loads the worker vector only from `worker_properties`. Keys are `'static`. There is no client property bag.
- `ProtectClock=true` is the systemd unit property that denies changing the system clock. The PID 1 check reads the effective property back (`systemctl show -p ProtectClock --value`) and accepts only `yes` or `true`. That boolean attest is not a clock-change probe inside the worker: the harness does not call `clock_settime`, `settimeofday`, or `adjtimex`, and it does not open the RTC device from the worker. It is not a mount, network, or user namespace, and it is not `Ready`. Existing `PrivateDevices=true` is a different control and is not re-proven by this readback.
- The unit test `derived_worker_protect_clock` requires the key and requires its debug form to contain `true`. It also requires the property list to omit `ProtectHome`, `RestrictAddressFamilies`, and `CPUQuota`. The full `worker_properties` vector still does not set those three, and it does not set `MemoryDenyWriteExecute`, `PrivateUsers`, `ProtectKernelLogs`, `ProtectKernelModules`, `LimitAS`, `LimitDATA`, or `LimitSTACK`.
- `pid1_worker_protect_clock` is `#[cfg(test)]` and `#[ignore]`, requires `/proc/1/comm` = `systemd` and euid 0, derives the unit, and reads `systemctl show -p ProtectClock --value`. It accepts only `yes` or `true`. Job id `[0x1c; 16]` is not reused by another PID 1 test. The harness then stops the worker and the mount. It does not set the clock, open HTTP, inject a client property, or mark the broker `Ready`.
- The three-dot diff is `backend/media-broker/src/dbus.rs`, `sdd/STATUS.md`, and the WIP progress note. No secrets, no media HTTP route, no Kotlin capability flag, no `CPUQuota`, no socket-family allowlist, and no Java pin change.

## Residuals (not findings)

`003B-4C` stays open. So do socket family, global quota, terminals without ACK, FD/mmap after the seal, restart on every durable transition, remaining RLIMIT (`LimitAS`, `LimitDATA`, `LimitSTACK`), `ProtectHome`, `CPUQuota`, `RestrictAddressFamilies`, the remaining namespace properties (`PrivateUsers`, `MemoryDenyWriteExecute`, `ProtectKernelLogs`, `ProtectKernelModules`), `Ready`, and media HTTP. The PID 1 check reads the effective boolean. It does not attempt to change the clock inside the worker and then prove the attempt failed. `PrivateNetwork=true` from the earlier cut is unchanged and is not a substitute for `RestrictAddressFamilies`. `PrivateDevices=true` is unchanged and is not a substitute for this property. `ProtectClock` does not close those residuals. STATUS names this cut and keeps `003B-4C` open; it does not enumerate every remaining namespace property. The PR body still says remaining namespaces stay out, and `plan.md` leaves `003B-4C` and TASK-005 unchecked.

## Findings

No P0. No P1. No P2. No P3.
