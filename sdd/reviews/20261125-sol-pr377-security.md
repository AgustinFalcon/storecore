VERDICT: APPROVED

## Evidence identity

- provider: xAI
- model: Grok 4.7
- effort: medium
- substitute-for: gpt-5.6-sol-medium (no quota)
- lane: security
- independent of the architecture lane
- PR: 377 OPEN https://github.com/AgustinFalcon/storecore/pull/377
- head: `bc7bf2038da15d937820ca7bd7b2e1d10996ac89`
- base: `fd69baa3e5ebc3bfd81eddecda07bc4871132c2a` (`origin/master`, `docs: persist PR 374 dual Grok reviews without closing 4C (#376)`)
- `git rev-parse HEAD` and `git rev-parse origin/master` match those SHAs
- `gh pr view 377`: `MERGEABLE` / `CLEAN`
- branch left on `feat/media-broker-4c-private-network-20261124`; no checkout
- Verify: `45547855613` exact-head 7/7 `completed` / `success`, event `pull_request`, none cancelled
- this file is not a GitHub approval
- this review does not close `003B-4C`, does not mark Ready, and does not add HTTP

## Job conclusions (Verify 45547855613)

headSha `bc7bf2038da15d937820ca7bd7b2e1d10996ac89`. Run conclusion `success`. No job cancelled.

- repository-hygiene `138981659377`: `completed` / `success`
- backend `138981755619`: `completed` / `success`
- frontend `138981755620`: `completed` / `success`
- media-broker `138981755631`: `completed` / `success`
- media-broker-pid1 `138981755632`: `completed` / `success`
- unified-access-real-e2e `138981755657`: `completed` / `success`
- productive-routes-real-e2e `138981755673`: `completed` / `success`

`media-broker-pid1` log: `test dbus::tests::pid1_worker_private_network ... ok`. That step then reported `test result: ok. 12 passed; 0 failed; 0 ignored`.

## Why this cut

`gh pr view 377`: open, title `feat(media): attest PID 1 PrivateNetwork on the worker unit`. The body says `PrivateNetwork=true` is derived inside `worker_properties`, the client does not supply it, PID 1 reads the effective property, `RestrictAddressFamilies` and `CPUQuota` stay unset, and `003B-4C` stays open (socket family, global quota, ACK, FD/mmap, remaining RLIMIT, and Ready). No media HTTP. Those sentences match the tree.

`plan.md` is not in the diff. At this SHA `MEDIA-NORMALIZE-003B-4C` is still `- [ ]`, and `TASK-005` is still `- [ ]`. `STATUS.md` and `progress.md` say this cut derives `PrivateNetwork=true`, PID 1 reads it, and the document does not close `003B-4C`. Ready and HTTP stay out.

Prior security reviews applied here:

- `sdd/reviews/20261124-sol-pr374-security.md` left `PrivateNetwork`, socket family, `CPUQuota`, namespaces, global quota, and Ready open, and required `LimitNOFILE` to stay an internal constant on the fixed worker vector with an empty `StartTransientUnit` auxiliary. This cut adds the internal `PrivateNetwork` boolean beside `NoNewPrivileges`. It keeps `RestrictAddressFamilies` and `CPUQuota` off the vector. It does not check off `003B-4C`.
- `sdd/reviews/20261124-sol-pr366-security.md` required `TransientUnits::derive` to take only job id, mount root, principal, and approved runtime, `confirm()` before `StartTransientUnit`, and no client property bag. `daemon.rs`, `runtime.rs`, and `systemd.rs` are outside this diff. `BrokerDaemon::start` still calls `confirm()` before `TransientUnits::derive`.

## Controls

- `git diff origin/master...HEAD` is three paths, +80/−6: `backend/media-broker/src/dbus.rs`, `sdd/STATUS.md`, and `sdd/wip/20261116-catalog-media-upload-and-variant-gallery/4-implementation/progress.md`. Untracked persist-of-persist review files are outside that diff.
- `PrivateNetwork` is `Value::from(true)` on the same fixed `worker_properties` vector as `NoNewPrivileges`. The function does not read `BrokerRequest`. `BrokerRequest` remains the 72-byte frame (`REQUEST_LENGTH`) of operation, job id, revision, digest, and size. There is no client property bag.
- `properties()` still chooses `mount_properties` or `worker_properties`. `ZbusSystemd::start` still calls `StartTransientUnit` with `(name, START_MODE, properties, auxiliary)` and `auxiliary` is an empty vector. The mount vector does not gain `PrivateNetwork`.
- The derived-key unit test requires `PrivateNetwork`, requires `LimitNOFILE`, and asserts `RestrictAddressFamilies` and `CPUQuota` are absent. A repo search of `backend/media-broker/src` finds no `CPUQuota` assignment and no `store_id`.
- The PID 1 harness is `#[cfg(test)]` and `#[ignore]`, requires `/proc/1/comm` = `systemd` and euid 0, builds the spec with `JobId::create([0xdd; 16])`, mount root `/run/storecore_media/jobs`, `Principal::create(2102, 2102)`, and `approved_pid1_runtime()`, and reads `systemctl show -p PrivateNetwork --value` on `spec.worker().name()`. It accepts only `yes` or `true`. A rejected `StartTransientUnit` fails the harness. `systemctl_property` stays inside `mod tests`.
- The diff adds no secrets, no media HTTP, no `Ready`, and no `store_id`. `plan.md` is untouched, so `003B-4C` and `TASK-005` stay unchecked.

## Residuals (not findings)

`RestrictAddressFamilies` is still absent, so `socket()` for address families remains available. `PrivateNetwork=true` places the worker in its own network namespace; the harness attests the PID 1 property and does not prove an off-box `connect()`. Pathname `AF_UNIX` stays a filesystem object and is outside this cut. `CPUQuota`, other namespaces, global quota, terminals without ACK, FD/mmap after the seal, restart on every durable transition, and remaining RLIMIT stay open. `003B-4B-3`, `003B-4B-4`, `003B-4C`, `003B-4`, TASK-005, and #7 stay open. No HTTP and no `Ready`.

## Findings

No P0. No P1. No P2. No P3. No new gap that this cut must close.

`PrivateNetwork=true` is an internal boolean on the derived worker vector, the same shape as `NoNewPrivileges`. The client cannot supply it. `StartTransientUnit` still receives an empty auxiliary vector. `RestrictAddressFamilies` and `CPUQuota` stay unset. The diff adds no HTTP, no secret, no `store_id`, and no `Ready`. `003B-4C` and TASK-005 stay unchecked. This file is not a GitHub approval.
