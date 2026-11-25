VERDICT: APPROVED

## Evidence identity

- provider: xAI
- model: Grok 4.7
- effort: medium
- substitute-for: gpt-5.6-sol-medium (no quota)
- lane: security
- independent of the architecture lane
- PR: 379 OPEN https://github.com/AgustinFalcon/storecore/pull/379
- head: `7b897ccbf17991d36a30783df8a370d6efd8a136`
- base: `cca3433fc99a245c5323bdc3aa3c85fb5ee7fd36` (`origin/master`, `docs: persist PR 377 dual Grok reviews without closing 4C (#378)`)
- `git rev-parse HEAD` and `git rev-parse origin/master` match those SHAs
- `gh pr view 379`: `MERGEABLE` / `CLEAN`
- branch left on `feat/media-broker-4c-limit-nproc-20261125`; no checkout
- Verify: `45551795655` exact-head 7/7 `completed` / `success`, event `pull_request`, none cancelled
- this file is not a GitHub approval
- this review does not close `003B-4C`, does not mark Ready, and does not add HTTP

## Job conclusions (Verify 45551795655)

headSha `7b897ccbf17991d36a30783df8a370d6efd8a136`. Run conclusion `success`. No job cancelled.

- repository-hygiene `138994433533`: `completed` / `success`
- backend `138994503160`: `completed` / `success`
- frontend `138994503125`: `completed` / `success`
- media-broker `138994503179`: `completed` / `success`
- media-broker-pid1 `138994503216`: `completed` / `success`
- unified-access-real-e2e `138994503173`: `completed` / `success`
- productive-routes-real-e2e `138994503282`: `completed` / `success`

`media-broker-pid1` log: `test dbus::tests::pid1_worker_limit_nproc ... ok`. That step then reported `test result: ok. 13 passed; 0 failed; 0 ignored`.

## Why this cut

`gh pr view 379`: open, title `feat(media): attest PID 1 LimitNPROC on the worker unit`. The body says `LimitNPROC=64` is derived inside `worker_properties`, the client does not supply it, PID 1 reads the effective property, `RestrictAddressFamilies` and `CPUQuota` stay unset, and `003B-4C` stays open (socket family, global quota, ACK, FD/mmap, remaining RLIMIT, and Ready). No media HTTP. Those sentences match the tree.

`plan.md` is not in the diff. At this SHA `MEDIA-NORMALIZE-003B-4C` is still `- [ ]`, and `TASK-005` is still `- [ ]`. `STATUS.md` and `progress.md` say this cut derives `LimitNPROC=64`, PID 1 reads it, and the document does not close `003B-4C`. Ready and HTTP stay out.

Prior security reviews applied here:

- `sdd/reviews/20261125-sol-pr377-security.md` left socket family, `CPUQuota`, other namespaces, global quota, terminals without ACK, FD/mmap after the seal, restart on every durable transition, remaining RLIMIT, and Ready open. `PrivateNetwork=true` stays on the derived worker vector. This cut adds the internal `LimitNPROC` u64 beside `LimitNOFILE`. It keeps `RestrictAddressFamilies` and `CPUQuota` off the vector. It does not check off `003B-4C`.
- `sdd/reviews/20261124-sol-pr374-security.md` required `LimitNOFILE` to stay an internal constant on the fixed worker vector with an empty `StartTransientUnit` auxiliary, and left `PrivateNetwork`, socket family, `CPUQuota`, namespaces, global quota, and Ready open. `LimitNOFILE=1024` stays. This cut uses the same shape for `LimitNPROC=64`. `daemon.rs`, `runtime.rs`, and `systemd.rs` are outside this diff. `BrokerDaemon::start` still calls `confirm()` before `TransientUnits::derive`.

## Controls

- `git diff origin/master...HEAD` is three paths, +87/−11: `backend/media-broker/src/dbus.rs`, `sdd/STATUS.md`, and `sdd/wip/20261116-catalog-media-upload-and-variant-gallery/4-implementation/progress.md`. Untracked persist-of-persist review files are outside that diff.
- `WORKER_LIMIT_NPROC` is a private `u64` constant `64`. `worker_properties` places `Value::from(WORKER_LIMIT_NPROC)` on `LimitNPROC` in the same fixed vector as `LimitNOFILE` and `TasksMax` (`WORKER_TASKS_MAX` is also `64`). The function does not read `BrokerRequest`. `BrokerRequest` remains the 72-byte frame (`REQUEST_LENGTH`) of operation, job id, revision, digest, and size. There is no client property bag.
- `properties()` still chooses `mount_properties` or `worker_properties`. `ZbusSystemd::start` still calls `StartTransientUnit` with `(name, START_MODE, properties, auxiliary)` and `auxiliary` is an empty vector. The mount vector does not gain `LimitNPROC`.
- The derived-key unit test requires `LimitNPROC`, requires `LimitNOFILE`, and asserts `RestrictAddressFamilies` and `CPUQuota` are absent. The value assertion requires the debug form to contain the constant `64`. A repo search of `backend/media-broker/src` finds no `CPUQuota` assignment and no `store_id`.
- The PID 1 harness is `#[cfg(test)]` and `#[ignore]`, requires `/proc/1/comm` = `systemd` and euid 0, builds the spec with `JobId::create([0xee; 16])`, mount root `/run/storecore_media/jobs`, `Principal::create(2102, 2102)`, and `approved_pid1_runtime()`, and reads `systemctl show -p LimitNPROC --value` on `spec.worker().name()`. It accepts only `64` or a value that starts with `64:`. A rejected `StartTransientUnit` fails the harness. `systemctl_property` stays inside `mod tests`.
- The diff adds no secrets, no media HTTP, no `Ready`, and no `store_id`. `plan.md` is untouched, so `003B-4C` and `TASK-005` stay unchecked.

## Residuals (not findings)

`RestrictAddressFamilies` is still absent, so `socket()` for address families remains available. `PrivateNetwork=true` stays on the worker vector from the previous cut; this harness does not re-prove an off-box `connect()`. `CPUQuota`, other namespaces, global quota, terminals without ACK, FD/mmap after the seal, and restart on every durable transition stay open. `LimitNPROC=64` is `RLIMIT_NPROC` on this worker, aligned with the existing `TasksMax=64` cgroup task cap. It does not replace `TasksMax`, and other RLIMIT (`RLIMIT_AS`, `RLIMIT_CORE`, `RLIMIT_FSIZE`, and the rest) stay unset. The harness reads the unit property back; it does not sample `/proc/self/limits` after the `User=` drop. `003B-4B-3`, `003B-4B-4`, `003B-4C`, `003B-4`, TASK-005, and #7 stay open. No HTTP and no `Ready`.

## Findings

No P0. No P1. No P2. No P3. No new gap that this cut must close.

`LimitNPROC=64` is an internal `u64` on the derived worker vector, the same shape as `LimitNOFILE`. The client cannot supply it. `StartTransientUnit` still receives an empty auxiliary vector. `RestrictAddressFamilies` and `CPUQuota` stay unset. The diff adds no HTTP, no secret, no `store_id`, and no `Ready`. `003B-4C` and TASK-005 stay unchecked. This file is not a GitHub approval.
