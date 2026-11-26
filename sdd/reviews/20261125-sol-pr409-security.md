VERDICT: APPROVED

## Evidence identity

- provider: xAI
- model: Grok 4.7
- effort: medium
- substitute-for: gpt-5.6-sol-medium (no quota)
- lane: security
- independent of the architecture lane; `sdd/reviews/20261125-sol-pr409-architecture.md` was not read
- PR: 409 OPEN `feat(media): attest PID 1 ProtectKernelModules on the worker unit` https://github.com/AgustinFalcon/storecore/pull/409
- branch: `feat/media-broker-4c-protect-kernel-modules-20261125`
- head: `dc6219c3eb0f31d7d539308a665705ddadc74621`
- base: `6552fd77ddd3b70023850c3c508818c16a2e1885` (`origin/master`)
- `git rev-parse HEAD`, `git rev-parse origin/master`, `git merge-base HEAD origin/master`, and `gh pr view 409` (`headRefOid` / `baseRefOid`) match those SHAs
- review range: `6552fd77ddd3b70023850c3c508818c16a2e1885...dc6219c3eb0f31d7d539308a665705ddadc74621` (two commits, `bf45769` then `dc6219c`, four files, +104/−10)
- Verify: `45727472681` `pull_request`, attempt 3, headSha `dc6219c3eb0f31d7d539308a665705ddadc74621`, current conclusion `success`, 7/7 `completed` / `success`, none cancelled
- pre-rebase SHA `1521434` is superseded; this review uses `dc6219c` only
- this file is not a GitHub approval
- this review does not close `003B-4C`, does not mark Ready, and does not add HTTP
- untracked review leftovers `365`..`408` are outside this three-dot diff and are not part of the reviewed change

## Job conclusions (Verify 45727472681)

Current run conclusion `success`. Event `pull_request`. Attempt 3. No job cancelled. Seven jobs, each `completed` / `success`:

- repository-hygiene `139623570560`: `completed` / `success`
- media-broker `139623571815`: `completed` / `success`
- unified-access-real-e2e `139623571240`: `completed` / `success`
- productive-routes-real-e2e `139623571388`: `completed` / `success`
- frontend `139623616916`: `completed` / `success`
- backend `139623568921`: `completed` / `success`
- media-broker-pid1 `139623571048`: `completed` / `success` (00:16:03Z–00:42:56Z, 26m53s)

`media-broker-pid1` job `139623571048` log contains `test dbus::tests::pid1_worker_protect_kernel_modules ... ok` and `test result: ok. 28 passed; 0 failed; 0 ignored; 0 measured; 75 filtered out`. That log has zero `ENXIO` lines. `StartTransientUnit` accepted the derived `ProtectKernelModules` property. The job still runs the existing `Pin Temurin 21.0.13+9` step; this cut does not retarget that pin.

`media-broker` job `139623571815` log contains `test dbus::tests::derived_worker_protect_kernel_modules ... ok` and `test result: ok. 75 passed; 0 failed; 28 ignored; 0 measured; 0 filtered out`.

Attempts 1 and 2 of the same run are not the reviewed conclusion. Attempt 1: `unified-access-real-e2e` failed in `setup-java` with `No matching version found for SemVer '21.0.13+9'` (Temurin catalog), and `backend` failed in `Test backend` after the Temurin pin succeeded because Maven Central returned `429` for `surefire-junit-platform:pom:3.5.4`. Attempt 2: `backend` failed in `setup-java` with the same Temurin SemVer catalog miss; `unified-access-real-e2e` succeeded. `media-broker-pid1` was already `success` on those attempts and was not cancelled. None of those flakes are a sandbox or pin change in this diff.

The `timeout-minutes: 40` bump is CI job duration. On `bf45769`, Verify `45722480006` attempt 2 cancelled `media-broker-pid1` `139589722346` at 25m16s (23:48:55Z–00:14:11Z). On `dc6219c`, the successful PID 1 job ran 26m53s, so a 25-minute job timeout cannot cover this suite. `40` does not change `RuntimeMaxUSec`, `MemoryMax`, seccomp, capabilities, or any unit property. It is not a security property of the worker.

This review did not run `cargo` or the PID 1 harness on the Windows host. `git diff --check` on the three-dot range printed no whitespace errors. `sdd/wip/20261116-catalog-media-upload-and-variant-gallery/3-tasks/plan.md` still has `- [ ] TASK-005` (line 16) and `- [ ] MEDIA-NORMALIZE-003B-4C` (line 89) and is not in the diff. PR body checkboxes for Verify, dual review, and “Do not mark `003B-4C` / TASK-005 / HTTP closed” stay open.

## Why this cut

PR body, `sdd/STATUS.md`, and progress say the harness derives `ProtectKernelModules=true` and PID 1 reads it back. `ProtectHome`, `CPUQuota`, and `RestrictAddressFamilies` stay unset. Socket family, global quota, terminals without ACK, FD/mmap after the seal, restart on every durable transition, remaining RLIMIT, and Ready stay out. No media HTTP. The spec residual still requires a real UID A/UID B harness before `003B-4C` can close. `MEDIA-NORMALIZE-003B-4` is the only aggregate cut that may return `Ready`; ADR-001 says the `003B-4B` sub-cuts do not enable `Ready` individually. The diff does not check off `003B-4C`, Ready, TASK-005, or HTTP.

`ProtectHome` stays unset because an earlier cut recorded PID 1 `StartTransientUnit` `ENXIO` / unexpected message contents for that property, the same rejection class as `RestrictAddressFamilies` and `CPUQuota`. This cut does not put it back. The existing `pid1_worker_protect_home` assertion is outside the diff.

## Controls

- `worker_properties` appends `("ProtectKernelModules", Value::from(true))`. The boolean is a literal in that function. `TransientUnits::derive` still takes only job id, mount root, principal, and approved runtime. `BrokerRequest` stays a fixed frame (operation, 16-byte job id, revision, 32-byte digest, size) with no property map. The client cannot supply `ProtectKernelModules`.
- `StartTransientUnit` receives that derived vector and an empty auxiliary array. `properties` loads the worker vector only from `worker_properties`. Keys are `'static`. There is no client property bag.
- `ProtectKernelModules=true` is the systemd unit property that blocks kernel-module load and unload. The PID 1 check reads the effective property back (`systemctl show -p ProtectKernelModules --value`) and accepts only `yes` or `true`. That boolean attest is not a module-load probe inside the worker: the harness does not call `finit_module`, `init_module`, or `delete_module`, and it does not open `/proc/modules` or `/sys/module`. It is not a mount, network, or user namespace, and it is not `Ready`. Existing `PrivateDevices=true` is a different control and is not re-proven by this readback.
- The unit test `derived_worker_protect_kernel_modules` requires the key and requires its debug form to contain `true`. It also requires the property list to omit `ProtectHome`, `RestrictAddressFamilies`, and `CPUQuota`. The full `worker_properties` vector still does not set those three, and it does not set `MemoryDenyWriteExecute`, `PrivateUsers`, `LimitAS`, `LimitDATA`, or `LimitSTACK`.
- `pid1_worker_protect_kernel_modules` is `#[cfg(test)]` and `#[ignore]`, requires `/proc/1/comm` = `systemd` and euid 0, derives the unit, and reads `systemctl show -p ProtectKernelModules --value`. It accepts only `yes` or `true`. Job id `[0x1e; 16]` is not reused by another PID 1 test. The harness then stops the worker and the mount. It does not load a kernel module, open HTTP, inject a client property, or mark the broker `Ready`.
- `.github/workflows/verify.yml` changes only `media-broker-pid1` `timeout-minutes` from 25 to 40. The Temurin `21.0.13+9` pin, `setup-java` SHA, and `assert-temurin-21.mjs` step stay as they were.
- The three-dot diff is `backend/media-broker/src/dbus.rs`, `.github/workflows/verify.yml`, `sdd/STATUS.md`, and the WIP progress note. No secrets, no media HTTP route, no Kotlin capability flag, no `CPUQuota`, no socket-family allowlist, and no Java pin change.

## Residuals (not findings)

`003B-4C` stays open. So do socket family, global quota, terminals without ACK, FD/mmap after the seal, restart on every durable transition, remaining RLIMIT (`LimitAS`, `LimitDATA`, `LimitSTACK`), `ProtectHome`, `CPUQuota`, `RestrictAddressFamilies`, the remaining namespace properties (`PrivateUsers`, `MemoryDenyWriteExecute`), `Ready`, and media HTTP. The PID 1 check reads the effective boolean. It does not attempt to load or unload a kernel module from inside the worker and then prove the attempt failed. `timeout-minutes: 40` is how long GitHub Actions may run the job; it does not weaken the unit sandbox. `PrivateNetwork=true` from the earlier cut is unchanged and is not a substitute for `RestrictAddressFamilies`. `PrivateDevices=true` is unchanged and is not a substitute for this property. `ProtectKernelModules` does not close those residuals. STATUS names this cut and keeps `003B-4C` open; it does not enumerate every remaining namespace property. The PR body still says remaining namespaces stay out, and `plan.md` leaves `003B-4C` and TASK-005 unchecked.

## Findings

No P0. No P1. No P2. No P3.
