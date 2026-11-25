VERDICT: APPROVED

## Evidence identity

- provider: xAI
- model: Grok 4.7
- effort: medium
- substitute-for: gpt-5.6-sol-medium (no quota)
- lane: security
- independent of the architecture lane
- PR: 381 OPEN https://github.com/AgustinFalcon/storecore/pull/381
- head: `6e4d1c9709f4259575bd1c150d9e5a5d3bd3613b`
- base: `c616dffdf75d55e206f696c5c8c5b65fefd122c3` (`origin/master`, `docs: persist PR 379 dual Grok reviews without closing 4C (#380)`)
- `git rev-parse HEAD` and `git rev-parse origin/master` match those SHAs
- `gh pr view 381`: `MERGEABLE` / `CLEAN`
- branch left on `feat/media-broker-4c-limit-core-20261125`; no checkout
- Verify: `45556235165` exact-head 7/7 `completed` / `success`, event `pull_request`, none cancelled
- this file is not a GitHub approval
- this review does not close `003B-4C`, does not mark Ready, and does not add HTTP

## Job conclusions (Verify 45556235165)

headSha `6e4d1c9709f4259575bd1c150d9e5a5d3bd3613b`. Run conclusion `success`. No job cancelled.

- repository-hygiene `139008845009`: `completed` / `success`
- backend `139008921008`: `completed` / `success`
- media-broker `139008921026`: `completed` / `success`
- media-broker-pid1 `139008921069`: `completed` / `success`
- frontend `139008921097`: `completed` / `success`
- productive-routes-real-e2e `139008921004`: `completed` / `success`
- unified-access-real-e2e `139008921077`: `completed` / `success`

`media-broker-pid1` log: `test dbus::tests::pid1_worker_limit_core ... ok`. That step then reported `test result: ok. 14 passed; 0 failed; 0 ignored`.

## Why this cut

`gh pr view 381`: open, title `feat(media): attest PID 1 LimitCORE on the worker unit`. The body says `LimitCORE=0` is derived inside `worker_properties`, the client does not supply it, PID 1 reads the effective property, `RestrictAddressFamilies` and `CPUQuota` stay unset, and `003B-4C` stays open (socket family, global quota, ACK, FD/mmap, remaining RLIMIT, and Ready). No media HTTP. Those sentences match the tree.

`plan.md` is not in the diff. At this SHA `MEDIA-NORMALIZE-003B-4C` is still `- [ ]`, and `TASK-005` is still `- [ ]`. `STATUS.md` and `progress.md` say this cut derives `LimitCORE=0`, PID 1 reads it, and the document does not close `003B-4C`. Ready and HTTP stay out.

Prior security reviews applied here:

- `sdd/reviews/20261125-sol-pr379-security.md` left socket family, `CPUQuota`, other namespaces, global quota, terminals without ACK, FD/mmap after the seal, restart on every durable transition, remaining RLIMIT, and Ready open. `PrivateNetwork=true` and `LimitNPROC=64` stay on the derived worker vector. This cut adds the internal `LimitCORE` u64 `0` beside `LimitNOFILE` and `LimitNPROC`. It keeps `RestrictAddressFamilies` and `CPUQuota` off the vector. It does not check off `003B-4C`.
- `sdd/reviews/20261124-sol-pr374-security.md` required `LimitNOFILE` to stay an internal constant on the fixed worker vector with an empty `StartTransientUnit` auxiliary, and left `PrivateNetwork`, socket family, `CPUQuota`, namespaces, global quota, and Ready open. `LimitNOFILE=1024` stays. This cut uses the same shape for `LimitCORE=0`. `daemon.rs`, `runtime.rs`, and `systemd.rs` are outside this diff. `BrokerDaemon::start` still calls `confirm()` before `TransientUnits::derive`.

## Controls

- `git diff origin/master...HEAD` is three paths, +83/−8: `backend/media-broker/src/dbus.rs`, `sdd/STATUS.md`, and `sdd/wip/20261116-catalog-media-upload-and-variant-gallery/4-implementation/progress.md`. Untracked persist-of-persist review files are outside that diff.
- `WORKER_LIMIT_CORE` is a private `u64` constant `0`. `worker_properties` places `Value::from(WORKER_LIMIT_CORE)` on `LimitCORE` in the same fixed vector as `LimitNOFILE` and `LimitNPROC`. The function takes `&TransientUnits` and does not read `BrokerRequest`. `BrokerRequest` remains the 72-byte frame (`REQUEST_LENGTH`) of operation, job id, revision, digest, and size. There is no client property bag.
- `properties()` still chooses `mount_properties` or `worker_properties`. `ZbusSystemd::start` still calls `StartTransientUnit` with `(name, START_MODE, properties, auxiliary)` and `auxiliary` is an empty vector. The mount vector does not gain `LimitCORE`.
- The derived-key unit test requires `LimitCORE`, requires `LimitNOFILE` and `LimitNPROC`, and asserts `RestrictAddressFamilies` and `CPUQuota` are absent. The value assertion requires the debug form to contain the constant text `0`. A repo search of `backend/media-broker/src` finds no `CPUQuota` assignment and no `store_id`.
- The PID 1 harness is `#[cfg(test)]` and `#[ignore]`, requires `/proc/1/comm` = `systemd` and euid 0, builds the spec with `JobId::create([0xff; 16])`, mount root `/run/storecore_media/jobs`, `Principal::create(2102, 2102)`, and `approved_pid1_runtime()`, and reads `systemctl show -p LimitCORE --value` on `spec.worker().name()`. It accepts only `0` or a value that starts with `0:`. A rejected `StartTransientUnit` fails the harness. `systemctl_property` stays inside `mod tests`.
- The diff adds no secrets, no media HTTP, no `Ready`, and no `store_id`. `plan.md` is untouched, so `003B-4C` and `TASK-005` stay unchecked.

## Residuals (not findings)

`RestrictAddressFamilies` is still absent, so `socket()` for address families remains available. `PrivateNetwork=true` stays on the worker vector from the previous cut; this harness does not re-prove an off-box `connect()`. `CPUQuota`, other namespaces, global quota, terminals without ACK, FD/mmap after the seal, and restart on every durable transition stay open. `LimitCORE=0` is `RLIMIT_CORE` of zero bytes on this worker: systemd applies that single derived value as the unit ceiling, so a crash of this unit does not write a core. It does not replace `LimitNOFILE`, `LimitNPROC`, or `TasksMax`, and other RLIMIT (`RLIMIT_AS`, `RLIMIT_FSIZE`, and the rest) stay unset. The unit-test substring is the single digit `0`, so a non-zero debug form that contains that digit would still pass the in-process assert; the hosted PID 1 check is what pinned `0` or a `0:` prefix on this run. The harness reads the unit property back; it does not sample `/proc/self/limits` after the `User=` drop. `003B-4B-3`, `003B-4B-4`, `003B-4C`, `003B-4`, TASK-005, and #7 stay open. No HTTP and no `Ready`.

## Findings

No P0. No P1. No P2. No P3. No new gap that this cut must close.

`LimitCORE=0` is an internal `u64` on the derived worker vector, the same shape as `LimitNOFILE` and `LimitNPROC`. The client cannot supply it. `StartTransientUnit` still receives an empty auxiliary vector. `RestrictAddressFamilies` and `CPUQuota` stay unset. The diff adds no HTTP, no secret, no `store_id`, and no `Ready`. `003B-4C` and TASK-005 stay unchecked. This file is not a GitHub approval.
