VERDICT: APPROVED

## Evidence identity

- provider: Cursor
- model: grok-4.7-medium-fast
- effort: medium
- substitute-for: gpt-5.6-sol-medium
- lane: security
- PR: 332 OPEN https://github.com/AgustinFalcon/storecore/pull/332
- branch: `feat/media-broker-4b3-pid1-20261121`
- head SHA: `d9f6dacb006eb861544d24b29b9c301cfaf36c54`
- `git rev-parse HEAD`: `d9f6dacb006eb861544d24b29b9c301cfaf36c54` (matches required head)
- base SHA reviewed (`origin/master`, three-dot merge-base): `223513d6788afe95b7525efef17281882e7d451e`
- `origin/master` tip: `81747495dafb3e2afb1ced2daeb443d306038319`
- Verify: `44960599616` (`pull_request`, status `completed`, conclusion `success`, `headSha` equals this head)
- job ids (all `completed` / `success`, none `cancelled`):
  - repository-hygiene `137018321936`
  - media-broker-pid1 `137018380658`
  - media-broker `137018380670`
  - productive-routes-real-e2e `137018380685`
  - frontend `137018380689`
  - backend `137018380706`
  - unified-access-real-e2e `137018380783`
- local `cargo test` not run: host is Windows. Focused validation is the hosted logs on this SHA.
- prior security review of `a8e956a4c813e23d81ed30c42592d2b0ccdb7339` was `CHANGES_REQUIRED` (P2). This file replaces it.

## Diff reviewed

`git diff origin/master...HEAD`: 4 files, +125 / −6. Full diff read, then `stop` / `active_state` / `attest` / `from_zbus` in `dbus.rs`, `SystemdError` in `systemd.rs`, `unit_cleared` / `rollback_units` / `start_kind` in `daemon.rs`, and `plan.md` checkboxes.

| File | Change |
| --- | --- |
| `.github/workflows/verify.yml` | new `media-broker-pid1` job |
| `backend/media-broker/src/dbus.rs` | `NotLoaded` only for `NoSuchUnit`; PID 1 mount test; name classifier test |
| `backend/media-broker/src/systemd.rs` | `SystemdError::NotLoaded` |
| `sdd/wip/.../4-implementation/progress.md` | records the harness; leaves `003B-4B-3` and `003B-4C` open |

`plan.md` is not in the diff. `003B-4B-3` and `MEDIA-NORMALIZE-003B-4C` stay unchecked.

## Why this cut

Hosted root job calls `ZbusSystemd::connect_system` and start/attest/stop of one internally derived tmpfs `.mount`. Regular `media-broker` does not pass `--ignored`. No worker start, no `Ready`, no catalog HTTP, no secrets.

## P2 of a8e956a

Closed. `stop` no longer maps every `Unavailable` to `Inactive`.

- `from_zbus` maps only `zbus::Error::MethodError` through `classify_dbus_name`. Every other zbus error stays `Unavailable`.
- `classify_dbus_name` returns `NotLoaded` only when the name equals `org.freedesktop.systemd1.NoSuchUnit`. `org.freedesktop.DBus.Error.Disconnected` and `org.freedesktop.DBus.Error.Failed` stay `Unavailable`. `collected_unit_is_not_loaded_other_dbus_errors_stay_unavailable` locks those three names.
- `stop` returns `Ok(Inactive)` for `NotLoaded` only, both when `StopUnit` fails and when `wait_state` ends in `NotLoaded`. `Unavailable`, `UnknownState`, and any other error stay `Err`.
- `GetUnit` is the call that can yield `NotLoaded`. Proxy setup and `ActiveState` reads still use `Unavailable`. A deadline observation of `Active`, `Activating`, or `Deactivating` stays `Ok(that state)`.
- `attest` returns `active_state` unchanged, so `NotLoaded` is an error and cannot become `Active`. `start_transient` still fail-closes non-`Active` results. `unit_cleared` is only `Ok(Inactive | Failed)`; `Err(NotLoaded)` does not clear a unit. `start_kind` accepts only `Active` plus an active attest.

The PID 1 log on this SHA is the collected-unit path: `pid1_starts_and_stops_derived_tmpfs_mount ... ok` in 5.11s, then `mountinfo` must not contain the derived `Where`. That stop succeeds only if `NoSuchUnit` is classified as `NotLoaded`.

## What holds

- Client input. The new test builds `TransientUnits::derive` from a fixed `JobId`, `/run/storecore_media/jobs`, and `Principal::create(2102, 2102)`. `start_transient` / `stop` / `attest` still take `UnitKind` plus that spec. Names, `Where`, and properties stay inside `unit_name` and `mount_properties`. No new client unit-name, path, or property argument. `connect_system` is still called only from this ignored test.
- PID 1 job. `media-broker-pid1` checks out the pinned action, preserves only `PATH`, `CARGO_HOME`, and `RUSTUP_HOME` under `sudo`, and runs `--ignored pid1_starts_and_stops_derived_tmpfs_mount`. Log: that test `ok` in 5.11s; 58 other tests filtered out. Workflow permissions are contents/pull-requests read. The test requires `/proc/1/comm` == `systemd` and euid 0, asserts `UnitState::Active`, requires a `mountinfo` line containing the derived `Where` and `tmpfs`, then requires that line to be gone after stop.
- Regular broker. `media-broker` log: `pid1_starts_and_stops_derived_tmpfs_mount ... ignored`; `58 passed; 0 failed; 1 ignored`.
- Scope. `progress.md` and `plan.md` leave `003B-4B-3` and `003B-4C` open. This cut does not start the worker, wire Spring, or return `Ready`. No secrets, tag, deploy, or publish.

## Residuals (not findings)

UID A/B, cgroup, quota, worker `ExecStart`, and live inode attestation stay in open `003B-4B-3` / `003B-4C`. The CI users `storecore-backend` (2101) and `storecore-worker` (2102) are created and not switched to; the harness euid is root. `mountinfo` matching is a substring of the derived absolute `Where` plus `tmpfs`, backed here by the job hex and the passing log.

## Findings

No P0. No P1. No P2. No P3.
