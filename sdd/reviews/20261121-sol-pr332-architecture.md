VERDICT: APPROVED

## Evidence identity

- provider: Cursor
- model: grok-4.7-medium-fast
- effort: medium
- substitute-for: gpt-5.6-sol-medium
- lane: architecture
- PR: 332 OPEN `feat(media): attest derived tmpfs mount through PID 1` https://github.com/AgustinFalcon/storecore/pull/332
- branch: `feat/media-broker-4b3-pid1-20261121`
- git rev-parse HEAD reviewed: `d9f6dacb006eb861544d24b29b9c301cfaf36c54` (matches required head)
- PR `headRefOid`: `d9f6dacb006eb861544d24b29b9c301cfaf36c54`
- PR `baseRefOid`: `223513d6788afe95b7525efef17281882e7d451e` (merge of PR 331)
- merge-base(`origin/master`, HEAD): `223513d6788afe95b7525efef17281882e7d451e`
- local `origin/master` tip at review time: `81747495dafb3e2afb1ced2daeb443d306038319` (merge of PR 333). It is not an ancestor of this HEAD. Three-dot `origin/master...HEAD` still uses merge-base `223513d` and does not include PR 333.
- prior architecture review on `a8e956a4c813e23d81ed30c42592d2b0ccdb7339`: `APPROVED`, with the residual that `stop` mapped every `Unavailable` to `Inactive`
- security P2 on that same SHA: `CHANGES_REQUIRED` — `stop` mapped every `Unavailable` to `Inactive`
- Verify: `44960599616` (`pull_request`, name `Verify`, status `completed`, conclusion `success`, `headSha` `d9f6dacb006eb861544d24b29b9c301cfaf36c54`, display title matches this PR)
- local cargo: not re-run and not claimed (this host is Windows; the crate and the PID 1 harness are Linux)
- zbus pin checked against docs.rs: `zbus` `=5.19.0`. `Error::MethodError` is `(OwnedErrorName, Option<String>, Message)`.

## Job conclusions (Verify 44960599616)

Seven jobs, all `completed` / `success` on `d9f6dacb006eb861544d24b29b9c301cfaf36c54`. None cancelled. No other jobs on this run:

- repository-hygiene: success (`137018321936`)
- media-broker-pid1: success (`137018380658`)
- media-broker: success (`137018380670`)
- productive-routes-real-e2e: success (`137018380685`)
- frontend: success (`137018380689`)
- backend: success (`137018380706`)
- unified-access-real-e2e: success (`137018380783`)

## Diff read

`git diff origin/master...HEAD` is 4 files, +125/−6. Commits reachable from HEAD and not from the merge-base, in order: `08578d9`, `6c08960`, `d72906f`, `a8e956a`, `a56f28d`, `d9f6dac`.

| File | Role |
| --- | --- |
| `.github/workflows/verify.yml` | hosted `media-broker-pid1` job |
| `backend/media-broker/src/dbus.rs` | `NotLoaded` translator; `stop` maps only that variant to `Inactive`; ignored PID 1 mount test |
| `backend/media-broker/src/systemd.rs` | `SystemdError::NotLoaded` |
| `sdd/wip/20261116-catalog-media-upload-and-variant-gallery/4-implementation/progress.md` | records the harness and leaves `003B-4B-3` / `003B-4C` open |

`plan.md` is not in the diff. `003B-4B-3` remains `[ ]`. This review does not check off `003B-4B-3`, `003B-4C`, `Ready`, or catalog HTTP.

`a56f28d` introduced `NotLoaded` and classified through `zbus::Error::name()`. `d9f6dac` replaces that with a match on `zbus::Error::MethodError` only. `Error::name()` also returns a name for `Error::FDO`. The MethodError match keeps FDO, I/O, proxy, and every other zbus variant on `Unavailable`.

## Why this cut

ADR-001 and `plan.md` still require `003B-4B-3` to be a hardened daemon whose `.mount` and worker are created by PID 1 from internally derived names, paths, and properties. Progress on this SHA records only the mount half of a hosted harness: root opens the system bus with `ZbusSystemd::connect_system`, starts and stops the derived tmpfs `.mount`, and reads `/proc/self/mountinfo`. The worker is not started. `003B-4B-3` and `003B-4C` stay open.

## Focused validation (this SHA)

`media-broker-pid1` job `137018380658` ran `cargo +1.100.0 test --locked --all-targets -- --ignored pid1_starts_and_stops_derived_tmpfs_mount` as root after creating uids 2101 and 2102. Log: `running 1 test`, `dbus::tests::pid1_starts_and_stops_derived_tmpfs_mount ... ok`, `test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 58 filtered out; finished in 5.11s`. The other targets in that job ran 0 tests.

`media-broker` job `137018380670` still runs `cargo +1.100.0 test --locked --all-targets` with no `--ignored`. Log: `running 59 tests`, `pid1_starts_and_stops_derived_tmpfs_mount ... ignored, requires root, systemd PID 1, and the system bus`, then `ok. 58 passed; 0 failed; 1 ignored`. Integration targets: 5, 4, and 4 passed.

The 5.11s runtime matches `METHOD_TIMEOUT` (5s). `wait_state` still retries any `Err` until the deadline. `stop(...).expect("stop")` passed, so the deadline error was `NotLoaded` (mapped to `Inactive`) or the last poll was already `Inactive`/`Failed`. A deadline `Unavailable` would have failed that expect. The following mountinfo assertion is what shows the tmpfs is gone.

## Architecture

`TransientUnits::derive` is unchanged and remains the only constructor. The ignored test passes a fixed `JobId` (`[0x11; 16]`), mount root `/run/storecore_media/jobs`, `Principal::create(2102, 2102)`, and an `ApprovedRuntime`. It does not pass a unit name, `Where`, or `ExecStart`. The only D-Bus start is `start_transient(UnitKind::Mount, &spec)`. There is no `UnitKind::Worker` start and no process exec of the approved jar.

`SystemdError` stays a closed enum. `NotLoaded` is the new case for “PID 1 reports this derived unit is not loaded.” The wire name enters through one translator:

- `from_zbus` matches `zbus::Error::MethodError(name, _, _)` and passes `name.as_str()` to `classify_dbus_name`.
- `classify_dbus_name` returns `NotLoaded` only when that string is exactly `org.freedesktop.systemd1.NoSuchUnit`.
- Every other `MethodError` name, and every non-`MethodError` zbus variant, returns `Unavailable`.

`from_zbus` is applied only to `StopUnit` and `GetUnit`. `connect_system`, `manager`, `StartTransientUnit`, unit-proxy construction, `ActiveState` property reads, and a rejected unit object path still use `map_err(|_| SystemdError::Unavailable)`.

`ZbusSystemd::stop` promotes only `Err(SystemdError::NotLoaded)` to `Ok(UnitState::Inactive)`, both when `StopUnit` fails and the follow-up `active_state` is `NotLoaded`, and when `wait_state` ends in `NotLoaded`. `Ok(Inactive | Failed)` pass through. `Ok(Active)` at the deadline stays `Ok(Active)`. Any other error, including `Unavailable`, is returned unchanged. If `StopUnit` itself is `NotLoaded` but `active_state` is still `Active`, the original `NotLoaded` is returned and is not turned into `Inactive`.

`attest` still returns `active_state` as-is, so a missing unit there is `Err(NotLoaded)`, not `Ok(Inactive)`. `unit_cleared` is still only `Ok(Inactive | Failed)`. `Err(Unavailable)` and `Err(NotLoaded)` do not clear a unit. `rollback_units` therefore still quarantines when `stop` fails. `ZbusSystemd` is still not the daemon’s systemd. `FakeSystemd` remains the daemon test double.

`ZbusSystemd::connect_system` is still the only system-bus constructor. The crate calls it only from the ignored test.

The new job needs only `repository-hygiene`, uses the same pinned checkout and Rust 1.100.0 as `media-broker`, and filters to this one ignored test. Format, clippy, licenses, and the broker CVE scan stay on the regular `media-broker` job, which succeeded on this SHA.

The unit test `collected_unit_is_not_loaded_other_dbus_errors_stay_unavailable` asserts the closed mapping for `org.freedesktop.systemd1.NoSuchUnit`, `org.freedesktop.DBus.Error.Disconnected`, and `org.freedesktop.DBus.Error.Failed`. It calls `classify_dbus_name` directly. The `MethodError` match is what `d9f6dac` compiles against zbus 5.19.0, and the hosted stop path above is what exercises `GetUnit`/`StopUnit` through `from_zbus`.

## Findings

None. The previous architecture residual, which was also the security P2, is closed on this SHA: bus, proxy, property-read, and other method errors stay `Unavailable` and no longer become `Inactive`.

## Residuals (not findings)

`003B-4B-3`, `003B-4B-4`, aggregate `003B-4B`, `003B-4C`, `MEDIA-NORMALIZE-003B-4`, TASK-005, and issue #7 stay open. No `Ready`, no worker start, no UID A/B process, no cgroup, no Spring wiring, no HTTP, no secrets, no deploy, no tag, no publish.

`wait_state` does not treat a mid-poll `NotLoaded` as clearance, so a collected transient unit still spends the method timeout before `stop` returns `Inactive`. The hosted 5.11s result is that path. `stop` itself does not read mountinfo; the harness does.

The mountinfo assertion is a substring of the derived path plus `tmpfs`. It does not parse `nosuid`, `nodev`, `noexec`, size, mode, or uid/gid. Those effective checks remain on open `003B-4C`.

The job creates `storecore-backend` (2101) and `storecore-worker` (2102). The test's principal is 2102/2102, which only feeds the derived mount `gid`. User 2101 is unused.

The module note that unit tests never call `connect_system` is stale for this ignored test. `FakeSystemd` is still the double for every non-ignored test. The name classifier is tested as a string function; there is no constructed `zbus::Error::MethodError` fixture. The PID 1 test is the live `from_zbus` evidence.

## Standards applied

Closed `UnitKind`, `UnitState`, and `SystemdError` stay the domain types. The D-Bus error name is translated once at the zbus boundary; unknown names and non-method errors stay `Unavailable`. Derivation stays in `TransientUnits::derive`. The harness reads kernel mountinfo at the boundary and does not invent a string state. ADR-001: a future `non_exhaustive` zbus variant falls through `from_zbus`'s `_` arm and fails closed. `sdd/reviews/20261121-sol-pr331-architecture.md`: internal properties, no client exec/`Where`, and no gate check-off from a PID 1 slice. This SHA keeps that boundary.

## Conclusion

Head `d9f6dacb006eb861544d24b29b9c301cfaf36c54` attests one internally derived tmpfs `.mount` through PID 1 and `/proc/self/mountinfo`. `SystemdError::NotLoaded` is produced only from a zbus `MethodError` named `org.freedesktop.systemd1.NoSuchUnit`, and `stop` maps only that variant to `Inactive`. Bus, proxy, and other method errors stay `Unavailable`. The regular broker job still skips the ignored test. No P0–P3. `APPROVED` for the architecture lane. This file is not a GitHub approval, a merge, or a `Ready` declaration, and it does not check off `003B-4B-3` or `003B-4C`.
