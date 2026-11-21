VERDICT: APPROVED

## Evidence identity

- provider: Cursor
- model: grok-4.7-medium-fast
- effort: medium
- substitute-for: gpt-5.6-sol-medium (user-authorized; Sol usage limit)
- lane: architecture
- PR: 328 OPEN, `feat/media-broker-4b3-units-20261121`, title `feat(media): name .mount from Where and start workers as .service`
- git rev-parse HEAD: `7155a8e6c755b55d5d0bbc7e9578c151370deffd`
- head SHA reviewed: `7155a8e6c755b55d5d0bbc7e9578c151370deffd` (matches required SHA and GitHub `headRefOid`)
- base / three-dot merge-base / origin/master: `0e697802b1806e10cdec1aac6312aa613cf3d784` (all three match)
- prior architecture review: CHANGES_REQUIRED on `a42bbf4dcc8c1fe78d68120489ee67260062c02a` (P3). This file overwrites that review for the re-review SHA.
- working tree: untracked `sdd/reviews/20261121-sol-pr328-*.md` only; those files are not in HEAD and were not treated as implementation
- Verify run: `44950931261` (`pull_request`, completed, conclusion `success`, headSha `7155a8e6c755b55d5d0bbc7e9578c151370deffd`, not cancelled)
- local cargo: not run (no local fmt/clippy/test/license result is claimed)

## Job conclusions (Verify 44950931261)

All six required jobs are `completed` / `success`, not cancelled:

- repository-hygiene: success (`136988468564`)
- backend: success (`136988529843`)
- media-broker: success (`136988529804`)
- frontend: success (`136988529813`)
- productive-routes-real-e2e: success (`136988529963`)
- unified-access-real-e2e: success (`136988529789`)

The media-broker job ran the locked format/clippy/test step, the license script, SBOM, and the HIGH/CRITICAL CVE gate. Those conclusions are taken from the hosted job, not from a local cargo invocation.

## Why this cut

`003B-4B-3` in `plan.md` is still unchecked. ADR-001 section 4B-3 still defines the aggregate as a hardened daemon, an approved root-owned runtime, and transient `.mount` / worker units owned by PID 1, with names, paths, and properties derived internally. This PR does not check that box.

The progress note `2026-11-21 — 003B-4B-3 nombres PID 1 y adapter zbus` and the PR body claim a narrower start of the #320 residual: a `.mount` name is the systemd-escaped `Where`, the worker is a `.service` whose `ExecStart` is `java -jar` from `ApprovedRuntime`, and a blocking `zbus` 5.19.0 adapter calls only `StartTransientUnit` / `StopUnit` / `GetUnit`. `FakeSystemd` still drives daemon tests. CI does not open the system bus. The license allowlist grows for the MIT and dual expressions in that lockfile and still fails closed on an unlisted license. The note explicitly does not accredit the UID A/B harness, cgroup, `Ready`, or HTTP.

That scope claim matches the diff. `plan.md` is untouched. No Spring, HTTP, or capability factory change is in the three-dot diff. Broker `JobState::Running` remains the existing durable state after two `Active` attestations; it is not `MediaWorkerCapability::Ready`.

## Diff

`git diff --stat origin/master...HEAD`: 9 files, **1460 insertions, 74 deletions**.

- M `backend/media-broker/Cargo.lock` (+782)
- M `backend/media-broker/Cargo.toml` (+1)
- M `backend/media-broker/scripts/verify-license-policy.mjs` (+13/−1)
- M `backend/media-broker/src/daemon.rs` (+99/−…)
- A `backend/media-broker/src/dbus.rs` (+340)
- M `backend/media-broker/src/lib.rs` (+1)
- M `backend/media-broker/src/systemd.rs`
- M `backend/media-broker/src/unit.rs`
- M `sdd/wip/20261116-catalog-media-upload-and-variant-gallery/4-implementation/progress.md` (+12)

Commits on this head, oldest first: `31c70ef` (name `.mount` from `Where`, worker `.service`, zbus adapter), `eb074fa` (own the D-Bus unit name string), `a42bbf4` (pass `UnitName` by reference), `7155a8e` (derive specs before persisting `Starting`).

`zbus` is pinned `=5.19.0` with `default-features = false` and features `async-io` and `blocking-api`. The crate lint `unsafe_code = forbid` is unchanged. Lockfile package `zbus` is version `5.19.0`.

## Prior P3 — closed

On `a42bbf4`, `BrokerDaemon::start` confirmed the runtime, journaled `JobState::Starting`, and only then called `TransientUnits::derive`. A rejected `Where` returned `SystemdError::Unavailable` through `?` before `abort_start`, so the job stayed `Starting` with admission open. `Starting` expects a runtime and cannot be started again.

On `7155a8e` the order is `confirm`, then `TransientUnits::derive`, then the durable `Starting` transition (`daemon.rs` `start`). `derive` is the only producer of `MountSpec` / `WorkerSpec`, and every rejection (`relative`, `..`, non-UTF-8, name longer than 255) is `Unavailable` before `store.transition`. `JobState::allows` has no edge from `Starting` back to `InputSealed`, so the test's final `InputSealed` cannot be a rolled-back `Starting`.

`start_rejects_relative_where_before_starting` builds a daemon whose `mount_root` is the relative path `mnt`, seals the job, and expects `Err(DaemonError::Systemd(SystemdError::Unavailable))`, `JobState::InputSealed`, and `AdmissionStatus::Open`. That is the derive-first compensation: no unit was created, so quarantine and an admission latch are not required. `InputSealed` does not `expects_runtime`. A later start can proceed once the root-owned mount root is absolute. The stuck-`Starting` hole is gone.

Later `start_kind` and `Running` persist failures still go through `abort_start`, which either records `Terminal` after both units are `Inactive` or `Failed`, or quarantines and latches.

## Review

Closed types still translate unknown wire once. `UnitKind::from_wire` and `UnitState::from_wire` keep `Unknown`. `UnitState::from_active_state` maps `inactive` / `activating` / `active` / `deactivating` / `failed` and every other string, including `reloading` and `maintenance`, to `Unknown`. `ZbusSystemd::active_state` turns `Unknown` into `SystemdError::UnknownState` rather than `Ok(Unknown)`. `BrokerDaemon::start_kind` still accepts only `Ok(Active)` from `start_transient` and only `is_active()` from `attest`. `Ok(Unknown)` and any other `Ok` stay fail-closed. `unit_cleared` is still only `Ok(Inactive | Failed)`.

Callers cannot supply the unit name, `Where`, `ExecStart`, or the D-Bus method:

- `TransientUnits`, `MountSpec`, and `WorkerSpec` stay constructible only through `TransientUnits::derive`. Fields are private. `derive` takes `JobId`, the daemon `mount_root`, the worker `Principal`, and `&ApprovedRuntime`.
- `BrokerDaemon::start` and `derived_units` pass that same quartet. The protocol module is not in this diff.
- The mount name comes from `mount_unit_name` of `mount_root` plus the job hex. The worker name is `storecore-media-<job hex>.service`. The old `.scope` suffix is gone.
- `WorkerSpec::argv` is the approved Java path, `-jar`, and the approved jar path. `worker_properties` builds that same triple from `java()` / `jar()` and sends it as `ExecStart`. It also sends `Requires` / `After` on the derived mount name, `Type=exec`, numeric `User` / `Group` from the daemon principal, and `WorkingDirectory` equal to the derived `Where`.
- Mount properties send fixed `tmpfs` / `Type` / `TMPFS_OPTIONS` and the derived `Where`. The auxiliary unit array is empty. Modes are the literals `fail`.
- `Proxy::call` is only reached with the literals `StartTransientUnit`, `StopUnit`, and `GetUnit`. `DbusMethod::from_wire` is not on that path, so an unknown method byte cannot select a bus method. `UnitKind::Unknown` returns `UnexpectedKind` before a call.
- `connect_system` uses `Builder::system` only. Daemon tests still construct `FakeSystemd`. Nothing in the crate calls `connect_system`. There is no binary `main`.

The escape used for the tested paths matches systemd path escaping: `/` becomes `-`, `-` becomes `\x2d`, `/` is `-.mount`, `/home/lennart` is `home-lennart.mount`, and a relative path or a `..` component is rejected before any bus call. Rejecting `..` instead of resolving it is stricter than `systemd-escape --path` and keeps a path such as `/tmp/../etc` from becoming `etc.mount`.

`ZbusSystemd` checks that a job object path is `/org/freedesktop/systemd1/job/` plus digits, and that a unit object path starts with `/org/freedesktop/systemd1/unit/` and is longer than that prefix. A failed `StopUnit` still accepts an already `Inactive` or `Failed` unit. Timeout and `Failed` while waiting to become `Active` do not become `Running`.

`UnitName` is a 255-byte closed buffer. Getters and `FakeSystemd::recorded` borrow it. The zbus adapter copies the name to an owned `String` before `StartTransientUnit`, `StopUnit`, and `GetUnit`.

License policy: the allowlist adds `(MIT OR Apache-2.0) AND Unicode-3.0`, `Apache-2.0 OR MIT`, `MIT`, and `Unlicense OR MIT`. An unlisted or missing license still throws. The script passes `--filter-platform x86_64-unknown-linux-gnu`. The hosted license step succeeded on this SHA. No local `cargo metadata` was run, so this review does not restate a crate-by-crate license map.

## Residuals (not findings)

- `003B-4B-3` aggregate, `003B-4B-4`, `003B-4C`, `MEDIA-NORMALIZE-003B-4`, TASK-005, and issue #7 stay open. No `Ready`, no HTTP catalog media, no Spring `BrokeredMediaByteNormalizer`, no cgroup or quota attestation, no UID A/B harness.
- `connect_system` is not used in CI or in daemon tests. Transient properties are unproven against PID 1. `FakeSystemd` remains the test double.
- The encoder does not apply systemd's leading-`.` rule (`/.dotdir` should be `\x2e...`, not `.dotdir...`). The paths this cut tests, including `/run/storecore_media/jobs/<hex>`, do not start with a dot after the leading slash. A mismatched mount name is refused by PID 1 because the unit name must be the escaped `Where`, and that refusal goes through `abort_start`.
- `TMPFS_OPTIONS` is still `nosuid,nodev,noexec,size=48M,nr_inodes=1024` with no `mode` / `uid` / `gid`. tmpfs default mode is 1777 once PID 1 applies those options. Private mount namespace, parent traversal, `NoNewPrivileges`, and syscall/cgroup confinement are still the open aggregate, not this SHA.
- `ExecStart` is only the approved `java -jar` triple. No job argument, socket activation, or `SELF_TEST` / `NORMALIZE` opcode is in this cut. `4C` remains the gate that runs those inside the unit.
- `GetUnit`'s returned object path is checked for the systemd unit prefix, not for equality with the escaped unit name. The trust anchor of this adapter is PID 1 on the system bus.
- `worker_properties` rebuilds the argv triple instead of calling `WorkerSpec::argv`. Both take the approved Java and jar paths. The property test asserts the `ExecStart` key and checks `argv()` separately.
- The license script filters metadata to `x86_64-unknown-linux-gnu`. ADR-001 also names arm64. This lockfile's zbus graph is target-independent Rust; Windows-only zbus deps are not what the Linux job links. Unknown licenses still fail the filtered graph.
- `DbusMethod` remains a closed wire enum with `Unknown` and is not connected to `Proxy::call`.

## Findings summary

No P0. No P1. No P2. No P3.

The previous P3 is closed on this SHA: `TransientUnits::derive` runs before the durable `Starting` transition, and `start_rejects_relative_where_before_starting` expects `Unavailable` with the job still `InputSealed` and admission open.
