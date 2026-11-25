VERDICT: APPROVED

## Evidence identity

- provider: xAI
- model: Grok 4.7
- effort: medium
- substitute-for: gpt-5.6-sol-medium (no quota)
- lane: security
- independent of the architecture lane
- PR: 374 OPEN https://github.com/AgustinFalcon/storecore/pull/374
- head: `69827b8ed2b41e91daf72c4ad7c50d57c26046df`
- base: `527705c18099afe74d78434e55d259350ba3c2a0` (`origin/master`)
- `git rev-parse HEAD` and `git rev-parse origin/master` match those SHAs
- branch left on `feat/media-broker-4c-socket-family-20261124`; no checkout
- Verify: `45541300889` exact-head 7/7 `completed` / `success`, none cancelled
- this file is not a GitHub approval
- this review does not close `003B-4C`, does not mark Ready, and does not add HTTP

## Job conclusions (Verify 45541300889)

headSha `69827b8ed2b41e91daf72c4ad7c50d57c26046df`. Run conclusion `success`. No job cancelled.

- repository-hygiene `138960198371`: `completed` / `success`
- media-broker `138960283454`: `completed` / `success`
- frontend `138960283458`: `completed` / `success`
- unified-access-real-e2e `138960283460`: `completed` / `success`
- backend `138960283488`: `completed` / `success`
- productive-routes-real-e2e `138960283494`: `completed` / `success`
- media-broker-pid1 `138960283521`: `completed` / `success`

`media-broker-pid1` runs `cargo test --locked --all-targets -- --ignored --test-threads=1 pid1_`, which includes `pid1_worker_limit_nofile`.

## Why this cut

`003B-4C` stays open in `plan.md` (`[ ]`). STATUS and progress say PID 1 rejected `RestrictAddressFamilies` with `ENXIO` (same class as `CPUQuota`) and that this cut attests an internally derived `LimitNOFILE=1024`. The diff does not check off `003B-4C`, Ready, or HTTP. Socket families, `PrivateNetwork`, namespaces, and `CPUQuota` stay out.

## Controls

- `WORKER_LIMIT_NOFILE` (`1024`) is a private constant. `worker_properties` is the only worker property vector and places that constant on `LimitNOFILE`. `TransientUnits::derive` still takes only job id, mount root, principal, and approved runtime. `BrokerRequest` is a fixed 72-byte frame (`REQUEST_LENGTH`) with operation, job id, revision, digest, and size. There is no client property bag.
- `ZbusSystemd::start` calls `StartTransientUnit` with `(name, START_MODE, properties, auxiliary)` and `auxiliary` is an empty vector. Mount and worker properties come only from `properties(kind, spec)`. The client cannot supply `LimitNOFILE`, `RestrictAddressFamilies`, or `CPUQuota`.
- The unit test on the derived vector asserts `LimitNOFILE` is present and contains `1024`, and asserts `RestrictAddressFamilies` and `CPUQuota` are absent.
- The PID 1 harness is `#[cfg(test)]` and `#[ignore]`, requires euid 0 and PID 1 `systemd`, starts the derived worker, and reads `LimitNOFILE` back with `systemctl show -p LimitNOFILE --value`. It accepts `1024` or a value that starts with `1024:`. A rejected `StartTransientUnit` fails the harness.
- The diff adds no secrets, no media HTTP, no `Ready`, and no `store_id`. `plan.md` is untouched and `MEDIA-NORMALIZE-003B-4C` remains `[ ]`.

## Residuals (not findings)

`RestrictAddressFamilies` is not on the unit. AF_INET and other families stay available. `CPUQuota`, `PrivateNetwork`, namespaces, global quota, and `Ready` remain open. `LimitNOFILE=1024` caps open files for this worker; it does not replace those controls. `003B-4C` stays open.

## Findings

No P0. No P1. No P2. No P3.
