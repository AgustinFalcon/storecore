VERDICT: APPROVED

## Evidence identity

- provider: xAI
- model: Grok 4.7
- effort: medium
- substitute-for: gpt-5.6-sol-medium (no quota)
- lane: security
- independent of the architecture lane
- PR: 393 OPEN `feat(media): attest PID 1 RestrictRealtime on the worker unit` https://github.com/AgustinFalcon/storecore/pull/393
- branch: `feat/media-broker-4c-restrict-realtime-20261125`
- head: `8c006b51f6baaed3d0b0c4193629621f1727c403`
- base: `57ee9b87218fbed2be65a174e74aef4f3ccfc97e` (`origin/master`)
- `git rev-parse HEAD`, `git rev-parse origin/master`, and `git merge-base HEAD origin/master` match those SHAs
- review range: `57ee9b87218fbed2be65a174e74aef4f3ccfc97e...8c006b51f6baaed3d0b0c4193629621f1727c403` (one commit, three files, +100/−8)
- Verify: `45643109921` `pull_request`, headSha `8c006b51f6baaed3d0b0c4193629621f1727c403`, current conclusion `success`, 7/7 `completed` / `success`, none cancelled
- this file is not a GitHub approval
- this review does not close `003B-4C`, does not mark Ready, and does not add HTTP

## Job conclusions (Verify 45643109921)

Current run conclusion `success`. No job cancelled. Job ids after the failed-job rerun:

- repository-hygiene `139320163409`: `completed` / `success`
- backend `139320270013`: `completed` / `success`
- media-broker `139320269997`: `completed` / `success`
- media-broker-pid1 `139320248551`: `completed` / `success` (`run_attempt` 2)
- frontend `139320225268`: `completed` / `success`
- productive-routes-real-e2e `139320164567`: `completed` / `success`
- unified-access-real-e2e `139320160318`: `completed` / `success` (`run_attempt` 2)

Attempt 1 of the same run, same head SHA, concluded `failure`. Its jobs API recorded `media-broker-pid1` `139306933620` as `success`. The only attempt-1 failure was `unified-access-real-e2e` `139306933685`: setup-java rejected SemVer `21.0.13+9` because the catalog offered `21.0.13+9.0.LTS`. The rerun of that job passed. That failure is not `RestrictRealtime` and not `ENXIO`.

`media-broker-pid1` job `139320248551` log contains `test dbus::tests::pid1_worker_restrict_realtime ... ok` and `test result: ok. 20 passed; 0 failed`. That log has no `ENXIO` line. The jobs-log API returned the same bytes for attempt-1 job `139306933620`, so the ok line is cited from the post-rerun job.

`git diff --check` on the three-dot range printed no whitespace errors. `plan.md` still has `- [ ] MEDIA-NORMALIZE-003B-4C` and is not in the diff.

## Why this cut

PR body, `sdd/STATUS.md`, and progress say the harness derives `RestrictRealtime=true` and PID 1 reads it back. `ProtectHome`, `CPUQuota`, and `RestrictAddressFamilies` stay unset. Socket family, global quota, ACK, FD/mmap, remaining RLIMIT, and Ready stay out. No media HTTP. The spec residual still requires a real UID A/UID B harness before `003B-4C` can close, and says no isolated sub-cut enables `Ready`. The diff does not check off `003B-4C`, Ready, TASK-005, or HTTP.

## Controls

- `worker_properties` appends `("RestrictRealtime", Value::from(true))`. The boolean is a literal in that function. `TransientUnits::derive` still takes only job id, mount root, principal, and approved runtime. `BrokerRequest` stays a fixed frame (operation, 16-byte job id, revision, 32-byte digest, size) with no property map. The client cannot supply `RestrictRealtime`.
- `StartTransientUnit` receives that derived vector and an empty auxiliary array. Keys are `'static`. There is no client property bag.
- `RestrictRealtime=true` is systemd's deny for realtime scheduling policies (`SCHED_FIFO`, `SCHED_RR`, `SCHED_DEADLINE`). It is an effective-property attest read back from PID 1. It is not a mount, network, or user namespace, and it is not `Ready`.
- The unit test `derived_worker_restrict_realtime` requires the key and requires its debug form to contain `true`. It also requires the property list to omit `ProtectHome`, `RestrictAddressFamilies`, and `CPUQuota`. The full `worker_properties` vector still does not set those three.
- `pid1_worker_restrict_realtime` is `#[cfg(test)]` and `#[ignore]`, requires `/proc/1/comm` = `systemd` and euid 0, derives the unit, and reads `systemctl show -p RestrictRealtime --value`. It accepts only `yes` or `true`. Job id `[0x16; 16]` is not reused by another PID 1 test. The harness then stops the worker and the mount. It does not set a capability, open HTTP, or mark the broker `Ready`.
- The three-dot diff is `backend/media-broker/src/dbus.rs`, `sdd/STATUS.md`, and the WIP progress note. No secrets, no media HTTP route, no Kotlin capability flag, no `CPUQuota`, no socket-family allowlist.

## Residuals (not findings)

`003B-4C` stays open. So do socket family, global quota, terminals without ACK, FD/mmap after the seal, restart on every durable transition, remaining RLIMIT, `ProtectHome`, `CPUQuota`, `RestrictAddressFamilies`, `Ready`, and media HTTP. The PID 1 check reads the effective property. It does not call `sched_setscheduler` inside the worker. `PrivateNetwork=true` from the earlier cut is unchanged and is not a substitute for `RestrictAddressFamilies`.

## Findings

No P0. No P1. No P2. No P3.
