VERDICT: APPROVED

## Evidence identity

- provider: xAI
- model: Grok 4.7
- effort: medium
- substitute-for: gpt-5.6-sol-medium (no quota)
- lane: security
- independent of the architecture lane; `sdd/reviews/20261125-sol-pr385-architecture.md` was not read
- PR: 385 OPEN https://github.com/AgustinFalcon/storecore/pull/385
- title: feat(media): attest PID 1 LimitCPU on the worker unit
- branch: `feat/media-broker-4c-limit-cpu-20261125`
- head: `792397cbdebf8e112c839ea3d16e37a427009752`
- base: `97257c47ea20523f5f66dbae658bcc0e5a9a09d3` (`origin/master`)
- `git rev-parse HEAD` and `git rev-parse origin/master` match those SHAs
- `gh pr view 385`: OPEN, headRefOid and baseRefOid match, +104/−10 in 3 files
- `git diff --check origin/master...HEAD`: clean
- Verify: `45569539383` `pull_request`, exact-head 7/7 `completed` / `success`, none cancelled, headSha `792397cbdebf8e112c839ea3d16e37a427009752`
- earlier runs are not this head: `45565387818` failure headSha `9cc757bb1a1b0478aa0f13e3900d5adab7c4d95a` (rustfmt); `45567582042` failure headSha `905ba297c834b0c0fe3f4307325f9d7814084a42` (clippy `too_many_lines`)
- this file is not a GitHub approval
- this review does not close `003B-4C`, does not mark Ready, and does not add HTTP

## Job conclusions (Verify 45569539383)

headSha `792397cbdebf8e112c839ea3d16e37a427009752`. Run conclusion `success`. Event `pull_request`. No job cancelled.

- repository-hygiene `139052488103`: `completed` / `success`
- backend `139052573374`: `completed` / `success`
- media-broker `139052573522`: `completed` / `success`
- media-broker-pid1 `139052573592`: `completed` / `success`
- frontend `139052573348`: `completed` / `success`
- productive-routes-real-e2e `139052573387`: `completed` / `success`
- unified-access-real-e2e `139052573445`: `completed` / `success`

`media-broker-pid1` log: `dbus::tests::pid1_worker_limit_cpu ... ok`. `test result: ok. 16 passed; 0 failed; 0 ignored; 0 measured; 63 filtered out`.

## Why this cut

ADR-001 keeps `Ready` behind attested isolation, including `CPUQuota` and RLIMIT, and keeps `003B-4C` as the real Linux harness. The PR body, `sdd/STATUS.md`, and progress say this slice only derives `LimitCPU=12` (`RLIMIT_CPU` from the `IMAGE_IO_V1` timeout) and has PID 1 read it back. `plan.md` still has `[ ]` on `MEDIA-NORMALIZE-003B-4C`, `003B-4B-3`, `003B-4B-4`, and TASK-005. The diff does not touch `plan.md` and does not claim socket family, global quota, ACK, FD/mmap, remaining RLIMIT, Ready, or media HTTP.

## Controls

- `WORKER_RUNTIME_MAX_USEC` is `12_000_000`. `WORKER_LIMIT_CPU` is that constant divided by `1_000_000`, so the derived ceiling is 12 seconds. `worker_properties` inserts `("LimitCPU", Value::from(WORKER_LIMIT_CPU))` and does not insert `CPUQuota`.
- `LimitCPU` is systemd `RLIMIT_CPU` (CPU-time seconds, soft and hard from one uint64). It is not cgroup `CPUQuota` / `cpu.max`. `RuntimeMaxUSec` remains the separate 12s wall-clock timeout. The new unit test asserts the key is present and `CPUQuota` is absent.
- The client cannot supply the value. `BrokerRequest` is still operation, job id, revision, digest, and size. `TransientUnits::derive` takes job id, mount root, principal, and approved runtime. `StartTransientUnit` sends only the vector from `worker_properties`. Auxiliary units stay empty. `NoNewPrivileges=true` stays set, so the worker UID cannot raise the hard rlimit (`CAP_SYS_RESOURCE`).
- The PID 1 test is `#[ignore]` outside the root harness, checks PID 1 is `systemd` and euid 0, starts the derived transient units, and reads `LimitCPU` back with `systemctl show`. `systemctl` is not on the daemon start path.
- Diff surface is `backend/media-broker/src/dbus.rs`, `sdd/STATUS.md`, and progress. No secrets, no HTTP route, no capability flag, no `Ready`.

## Residuals (not findings)

`003B-4C` stays open. Still out: `RestrictAddressFamilies`, cgroup `CPUQuota`, global quota, ACK, FD/mmap after seal, restart on every durable transition, remaining RLIMIT, Ready, and media HTTP. `LimitCPU` does not replace `CPUQuota`: it is a per-process CPU-time ceiling, and a child starts its own counter, so `TasksMax=64` is not a cgroup CPU budget. The unit-test debug `contains("12")` check is loose; the binding attest is the PID 1 read. That read accepts `12` or a `12:` prefix and does not also show `CPUQuota` empty on the live unit. Absence of `CPUQuota` is proven on the derived property vector. systemd's default is no quota.

## Findings

No P0. No P1. No P2. No P3.
