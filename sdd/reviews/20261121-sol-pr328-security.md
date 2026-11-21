VERDICT: APPROVED

## Evidence identity

- provider: Cursor
- model: grok-4.7-medium-fast
- effort: medium
- substitute-for: gpt-5.6-sol-medium (user-authorized; Sol usage limit)
- lane: security
- PR: 328 OPEN `feat(media): name .mount from Where and start workers as .service` https://github.com/AgustinFalcon/storecore/pull/328
- branch: `feat/media-broker-4b3-units-20261121`
- head SHA: `7155a8e6c755b55d5d0bbc7e9578c151370deffd`
- `git rev-parse HEAD`: `7155a8e6c755b55d5d0bbc7e9578c151370deffd` (matches required head)
- base SHA reviewed (`origin/master`, merge-base, three-dot): `0e697802b1806e10cdec1aac6312aa613cf3d784`
- prior security review on this file: `a42bbf4dcc8c1fe78d68120489ee67260062c02a`, `VERDICT: APPROVED`, no P0–P3. This file overwrites that review for the new head.
- Verify: run `44950931261` (`pull_request`, name `Verify`, status `completed`, conclusion `success`, `headSha` equals this head)
- job conclusions (all `completed` / `success`, none `cancelled`):
  - `repository-hygiene` `136988468564` success
  - `backend` `136988529843` success
  - `media-broker` `136988529804` success
  - `frontend` `136988529813` success
  - `productive-routes-real-e2e` `136988529963` success
  - `unified-access-real-e2e` `136988529789` success
- local `cargo` not run. The crate is `#![cfg(target_os = "linux")]` and this host is Windows. Focused validation is the hosted `media-broker` job on this SHA.

## Diff reviewed

`git diff origin/master...HEAD`: 9 files, 1460 insertions, 74 deletions. The committed range is `31c70ef`, `eb074fa`, `a42bbf4`, and `7155a8e` (`fix(media): derive unit specs before persisting Starting`). Untracked review markdown is outside that range.

| File | + | − |
| --- | ---: | ---: |
| `backend/media-broker/Cargo.lock` | 782 | 0 |
| `backend/media-broker/src/dbus.rs` | 340 | 0 |
| `backend/media-broker/src/unit.rs` | 155 | 35 |
| `backend/media-broker/src/systemd.rs` | 69 | 26 |
| `backend/media-broker/src/daemon.rs` | 87 | 12 |
| `backend/media-broker/scripts/verify-license-policy.mjs` | 13 | 1 |
| `sdd/wip/20261116-catalog-media-upload-and-variant-gallery/4-implementation/progress.md` | 12 | 0 |
| `backend/media-broker/Cargo.toml` | 1 | 0 |
| `backend/media-broker/src/lib.rs` | 1 | 0 |

Full three-dot diff read, then `daemon.rs` `start` / `abort_start`, `store.rs` `transition` / `transition_internal`, `systemd.rs` `TransientUnits::derive`, `dbus.rs` method and property construction, `unit.rs` escape, and `runtime.rs` `confirm`. The delta from `a42bbf4` is only `daemon.rs`: derive the spec before `store.transition(..., Starting)`, plus `start_rejects_relative_where_before_starting`. `plan.md` still leaves `003B-4B-3` unchecked.

## Why this cut

`003B-4B-3` (plan, spec residual `003B-4B`, ADR-001 §4B-3, progress 2026-11-21): PID 1 names a transient `.mount` from the escaped `Where`, and the worker is a `.service` whose `ExecStart` is `java -jar` from the approved runtime. A blocking zbus adapter may call only `StartTransientUnit`, `StopUnit`, and `GetUnit`. The client still supplies none of the unit name, path, method, property bag, or command. `FakeSystemd` stays the in-memory double. This sub-cut does not return `Ready`, does not check off `003B-4B-3`, and does not replace `003B-4C`.

`7155a8e` closes the journal ordering gap left on `a42bbf4`: a `Where` that cannot be escaped must not persist `Starting`.

## Focused validation (this SHA)

Hosted `media-broker` job `136988529804`, all steps `success`:

- `Verify broker format, lints and Linux tests with the lockfile`
- `Verify broker dependency licenses`
- `Generate broker CycloneDX SBOM`
- `Fail closed on HIGH and CRITICAL broker CVEs`

`rustix` remains `=1.1.6`. Direct `zbus` is `=5.19.0` with `default-features = false` and features `async-io` and `blocking-api` only. The lockfile still pulls `async-process` `5.19.0` as a zbus dependency. No local test count is claimed.

## Re-check of the ordering fix

`BrokerDaemon::start` still admits only a record whose principal matches the caller and whose state is `InputSealed`. It then `confirm`s the approved runtime, derives `TransientUnits`, and only then calls `store.transition` to `Starting`. `transition_internal` is what calls `journal.persist`. A `TransientUnits::derive` error returns `DaemonError::Systemd(Unavailable)` before that call, before `start_kind`, and before `abort_start`.

`derive` builds `Where` as the daemon `mount_root` plus the job hex. `normalize_absolute` returns `None` for a relative path, `..`, or a Windows prefix, and `to_str` rejects non-UTF-8. `start_rejects_relative_where_before_starting` installs mount root `mnt`, seals the job, and asserts `start` returns `Unavailable`, the record stays `InputSealed`, and admission stays `Open`. That is the rejected-`Where` journal property: the job is not left in `Starting`, `Terminal`, or `Quarantined`.

The same `start` signature still takes only job id, revision, principal, and time. `MountSpec` and `WorkerSpec` fields stay private. `User` / `Group` remain the daemon worker principal, separate from the caller principal. Property keys stay `'static`. Auxiliary units stay an empty vector. `StartTransientUnit` / `StopUnit` stay mode `fail`. `DbusMethod::from_wire` is still not on the call path. `argv` is still the approved absolute Java path, `-jar`, and the approved absolute jar path. `#![forbid(unsafe_code)]` remains. No `src` caller invokes `ZbusSystemd::connect_system`.

## Findings

No P0–P3.

- Privilege. The reorder does not add a capability, a second principal, or a path from the job caller into `User` / `Group`. Authority is still the sealed record's principal. The worker identity is still the daemon's configured principal.
- Unit name and `Where`. Callers still cannot pass a unit name or a `Where`. The mount name is still `mount_unit_name` of the internally joined path. Relative `Where` fails in `derive` and never reaches `StartTransientUnit`.
- `ExecStart`. The worker property is still one `(java, [java, "-jar", jar], false)` tuple taken from `ApprovedRuntime`. `7155a8e` does not add an argument vector or a client command.
- D-Bus. Manager calls remain the three literals `StartTransientUnit`, `StopUnit`, and `GetUnit` on `org.freedesktop.systemd1`. A rejected `Where` returns before any of them. Unknown `ActiveState` still maps to `Unknown` and `SystemdError::UnknownState`. `start_kind` still records `Running` only after start and `attest` are `Active`.
- Journal. `Starting` is persisted only after `derive` returns `Ok`. The relative-path test locks `InputSealed` and an open admission gate.

## Residuals (not findings)

- `003B-4B-3`, `003B-4B-4`, the aggregate `003B-4B`, and `003B-4C` stay open. This SHA has no cgroup, quota, or mount attestation, no UID A/B harness, no `Ready`, no catalog HTTP, and no deploy.
- The property bag sets `User` and `Group` and the fixed tmpfs options `nosuid,nodev,noexec,size=48M,nr_inodes=1024`. It does not set `NoNewPrivileges`, `ProtectSystem`, or a non-world-writable tmpfs `mode=`. A later wiring of `connect_system` still needs that sandbox; this bag is not the `003B-4C` proof.
- `async-io` on zbus 5.19.0 also enables upstream `async-process` (used for `unixexec:` addresses). This adapter never passes a bus address or a command. `connect_system` is the only constructor and it is unused outside the type.
- `GetUnit`'s object path is prefix-checked. It is not compared again to the escaped unit name. Attestation trusts PID 1 for that lookup.
- `confirm` still runs before `derive`. It re-opens the approved runtime with `NOFOLLOW` and does not persist `Starting`. It does not hold an fd across a future exec. Parent trust plus confirm-before-`Starting` remains the control from PR 320.
- The relative-`Where` test asserts durable state and admission. It does not also assert an empty `FakeSystemd` map. `start` returns before `start_kind`, so no unit is submitted on that path.
- The license allowlist is by SPDX expression, so a future crate whose license text is already listed would pass. Unknown text still fails closed.

## Conclusion

Head `7155a8e6c755b55d5d0bbc7e9578c151370deffd` keeps client-supplied unit identity, methods, and commands out of the PID 1 adapter. Deriving the spec before `journal.persist` means a rejected `Where` leaves the job `InputSealed` and does not open a privilege, unit-name, `ExecStart`, or D-Bus bypass. No P0–P3. `APPROVED` for the security lane. This file is not a GitHub approval, merge, or `Ready` declaration.
