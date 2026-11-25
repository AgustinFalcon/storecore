VERDICT: APPROVED

## Evidence identity

- provider: xAI
- model: Grok 4.7
- effort: medium
- substitute-for: gpt-5.6-sol-medium (no quota)
- lane: security
- independent of the architecture lane; `sdd/reviews/20261125-sol-pr403-architecture.md` was not read
- PR: 403 OPEN `feat(media): attest PID 1 RestrictSUIDSGID on the worker unit` https://github.com/AgustinFalcon/storecore/pull/403
- branch: `feat/media-broker-4c-restrict-suidsgid-20261125`
- head: `c18fe2a92e8dfca8b622ec2c32920fc613f588dd`
- base: `2794cd027fff2571798683e4c2c3ce9e5c09f9c3` (`origin/master`, persist #401 dual Grok reviews without closing 4C, #402)
- `git rev-parse HEAD`, `git rev-parse origin/master`, `git merge-base HEAD origin/master`, and `gh pr view 403` (`headRefOid` / `baseRefOid`) match those SHAs
- review range: `2794cd027fff2571798683e4c2c3ce9e5c09f9c3...c18fe2a92e8dfca8b622ec2c32920fc613f588dd` (one commit, three files, +100/−9)
- Verify: `45690798203` `pull_request`, attempt 1, headSha `c18fe2a92e8dfca8b622ec2c32920fc613f588dd`, current conclusion `success`, 7/7 `completed` / `success`, none cancelled
- prior pre-rebase SHA `daddff3` and Verify `45686635140` are superseded; this review uses `c18fe2a` only
- this file is not a GitHub approval
- this review does not close `003B-4C`, does not mark Ready, and does not add HTTP
- untracked review leftovers `365`..`402` are outside this three-dot diff and are not part of the reviewed change

## Job conclusions (Verify 45690798203)

Current run conclusion `success`. Event `pull_request`. Attempt 1. No job cancelled. Seven jobs, each `completed` / `success`:

- repository-hygiene `139475404997`: `completed` / `success`
- media-broker `139475523444`: `completed` / `success`
- frontend `139475523445`: `completed` / `success`
- media-broker-pid1 `139475523448`: `completed` / `success` (20:01:07Z–20:24:34Z, 23m27s)
- backend `139475523490`: `completed` / `success`
- productive-routes-real-e2e `139475523530`: `completed` / `success`
- unified-access-real-e2e `139475523752`: `completed` / `success`

`media-broker-pid1` job `139475523448` log contains `test dbus::tests::pid1_worker_restrict_suidsgid ... ok` and `test result: ok. 25 passed; 0 failed; 0 ignored; 0 measured; 72 filtered out`. That log has zero `ENXIO` lines. `StartTransientUnit` accepted the derived `RestrictSUIDSGID` property. The job still runs the existing `Pin Temurin 21.0.13+9` step; this cut does not retarget that pin. A prior `TimedOut` / `Failed` flake is not treated as a code fix here.

`media-broker` job `139475523444` log contains `test dbus::tests::derived_worker_restrict_suidsgid ... ok` and `test result: ok. 72 passed; 0 failed; 25 ignored; 0 measured; 0 filtered out`.

This review did not run `cargo` or the PID 1 harness on the Windows host. `git diff --check` on the three-dot range printed no whitespace errors. `sdd/wip/20261116-catalog-media-upload-and-variant-gallery/3-tasks/plan.md` still has `- [ ] TASK-005` (line 16) and `- [ ] MEDIA-NORMALIZE-003B-4C` (line 89) and is not in the diff. PR body checkboxes for Verify, dual review, and “Do not mark `003B-4C` / TASK-005 / HTTP closed” stay open.

## Why this cut

PR body, `sdd/STATUS.md`, and progress say the harness derives `RestrictSUIDSGID=true` and PID 1 reads it back. `ProtectHome`, `CPUQuota`, and `RestrictAddressFamilies` stay unset. Socket family, global quota, terminals without ACK, FD/mmap after the seal, restart on every durable transition, remaining RLIMIT, and Ready stay out. No media HTTP. The spec residual still requires a real UID A/UID B harness before `003B-4C` can close, and says no isolated sub-cut enables `Ready`. ADR-001 still requires namespaces, no AF_INET/AF_INET6, `CPUQuota`, RLIMIT, and effective attestation before `Ready`. The diff does not check off `003B-4C`, Ready, TASK-005, or HTTP.

`ProtectHome` stays unset because PR #389 recorded PID 1 `StartTransientUnit` `ENXIO` / unexpected message contents for that property, the same rejection class as `RestrictAddressFamilies` and `CPUQuota`. This cut does not put it back. The existing `pid1_worker_protect_home` assertion is outside the diff.

## Controls

- `worker_properties` appends `("RestrictSUIDSGID", Value::from(true))`. The boolean is a literal in that function. `TransientUnits::derive` still takes only job id, mount root, principal, and approved runtime. `BrokerRequest` stays a fixed frame (operation, 16-byte job id, revision, 32-byte digest, size) with no property map. The client cannot supply `RestrictSUIDSGID`.
- `StartTransientUnit` receives that derived vector and an empty auxiliary array. `properties` loads the worker vector only from `worker_properties`. Keys are `'static`. There is no client property bag.
- `RestrictSUIDSGID=true` is the systemd unit property that refuses setting the set-user-ID and set-group-ID bits on files. The PID 1 check reads the effective property back (`systemctl show -p RestrictSUIDSGID --value`) and accepts only `yes` or `true`. That boolean attest is not a setuid or setgid behavioral probe inside the worker: the harness does not `chmod`, change ownership, or execute a setuid binary from the worker. It is not a mount, network, or user namespace, and it is not `Ready`. Existing `NoNewPrivileges=true` is a different control and is not re-proven by this readback.
- The unit test `derived_worker_restrict_suidsgid` requires the key and requires its debug form to contain `true`. It also requires the property list to omit `ProtectHome`, `RestrictAddressFamilies`, and `CPUQuota`. The full `worker_properties` vector still does not set those three, and it does not set `MemoryDenyWriteExecute`, `PrivateUsers`, `ProtectClock`, `ProtectKernelLogs`, `ProtectKernelModules`, `LimitAS`, `LimitDATA`, or `LimitSTACK`.
- `pid1_worker_restrict_suidsgid` is `#[cfg(test)]` and `#[ignore]`, requires `/proc/1/comm` = `systemd` and euid 0, derives the unit, and reads `systemctl show -p RestrictSUIDSGID --value`. It accepts only `yes` or `true`. Job id `[0x1b; 16]` is not reused by another PID 1 test. The harness then stops the worker and the mount. It does not set a capability, open HTTP, inject a client property, or mark the broker `Ready`.
- The three-dot diff is `backend/media-broker/src/dbus.rs`, `sdd/STATUS.md`, and the WIP progress note. No secrets, no media HTTP route, no Kotlin capability flag, no `CPUQuota`, no socket-family allowlist, and no Java pin change.

## Residuals (not findings)

`003B-4C` stays open. So do socket family, global quota, terminals without ACK, FD/mmap after the seal, restart on every durable transition, remaining RLIMIT (`LimitAS`, `LimitDATA`, `LimitSTACK`), `ProtectHome`, `CPUQuota`, `RestrictAddressFamilies`, the remaining namespace properties (`PrivateUsers`, `MemoryDenyWriteExecute`, `ProtectClock`, `ProtectKernelLogs`, `ProtectKernelModules`), `Ready`, and media HTTP. The PID 1 check reads the effective boolean. It does not attempt to set a setuid or setgid bit inside the worker and then prove the attempt failed. `PrivateNetwork=true` from the earlier cut is unchanged and is not a substitute for `RestrictAddressFamilies`. `NoNewPrivileges=true` is unchanged and is not a substitute for this property. `RestrictSUIDSGID` does not close those residuals. STATUS names this cut and keeps `003B-4C` open; it does not enumerate every remaining namespace property. The PR body still says remaining namespaces stay out, and `plan.md` leaves `003B-4C` and TASK-005 unchecked.

## Findings

No P0. No P1. No P2. No P3.
