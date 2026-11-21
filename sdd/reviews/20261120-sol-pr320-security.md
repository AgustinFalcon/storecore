VERDICT: APPROVED

## Evidence identity

- provider: Cursor
- model: grok-4.7-medium-fast
- effort: medium
- substitute-for: gpt-5.6-sol-medium (user-authorized; Sol usage limit)
- lane: security
- PR: 320 OPEN `feat(media): derive broker mount and worker units` https://github.com/AgustinFalcon/storecore/pull/320
- branch: `feat/media-broker-daemon-4b3-20261120`
- head SHA: `35b8ce711a6c07e7a1aa5e4b418c9031f9024070`
- `git rev-parse HEAD`: `35b8ce711a6c07e7a1aa5e4b418c9031f9024070` (matches required head)
- base SHA reviewed (`origin/master`, three-dot): `dd5c9a0060d2438014d17d463002f1676523c7f1`
- GitHub `baseRefOid`: `74152810031ec820dc52cd43bf8a4ef1120abec3`
- Verify: run `44856904469` (`pull_request`, status `completed`, conclusion `success`, `headSha` equals this head)
- job conclusions (all `completed` / `success`, none `cancelled`):
  - `repository-hygiene` success
  - `frontend` success
  - `media-broker` success
  - `unified-access-real-e2e` success
  - `backend` success
  - `productive-routes-real-e2e` success
- prior security APPROVED at `036976d` treated as stale. Re-reviewed `8b78b39`, `4d18bfa`, and `35b8ce7` on this head.
- local `cargo test` not run: crate is `#![cfg(target_os = "linux")]` and this host is Windows. Focused validation is the hosted `media-broker` job on this SHA.

## Diff reviewed

`git diff origin/master...HEAD`: 8 files, 1770 insertions, 3 deletions.

| File | + | − |
| --- | ---: | ---: |
| `backend/media-broker/src/daemon.rs` | 666 | 0 |
| `backend/media-broker/src/runtime.rs` | 493 | 0 |
| `backend/media-broker/src/systemd.rs` | 376 | 0 |
| `backend/media-broker/src/unit.rs` | 167 | 0 |
| `backend/media-broker/src/store.rs` | 36 | 1 |
| `backend/media-broker/src/journal.rs` | 18 | 2 |
| `sdd/wip/20261116-catalog-media-upload-and-variant-gallery/4-implementation/progress.md` | 10 | 0 |
| `backend/media-broker/src/lib.rs` | 4 | 0 |

Full diff read, then `runtime.rs`, `daemon.rs`, `systemd.rs`, `store.rs`, plus `unit.rs` and the journal persist path those call.

## Why this cut

`003B-4B-3` (plan, spec residual `003B-4B`, ADR-001): root-owned broker derives transient `.mount` / worker unit names, `Where`, and runtime paths internally. The client does not supply unit names, commands, or paths. `Unknown` wire states fail closed. This sub-cut does not return `Ready` and does not replace `003B-4C`.

## Focus checks (this SHA)

No P0–P3.

- Client unit name / `Where` / `ExecStart`. `BrokerDaemon::start` takes job id, revision, principal, and time. `TransientUnits::derive` builds names only from `DerivedUnits::from_job` (`storecore-media-` + hex job id + `.mount` / `.scope`). `Where` is `mount_root` plus that hex. `what` / options are the static `tmpfs` + `nosuid,nodev,noexec,size=48M,nr_inodes=1024`. Worker paths and digests are copied from `ApprovedRuntime`, which has no public constructor besides `open`.
- `from_wire` `Unknown` never becomes `Running`. `UnitState::from_wire` maps anything other than 1–5 to `Unknown`. `is_active` is only `Active`. `start_kind` rejects `Ok(Unknown)` as `UnknownState` and every other non-`Active` as `AttestationFailed`, on both `start_transient` and `attest`. `JobState::Running` is written only after both kinds pass that gate.
- Mode mask `0o7777`. Java must be exactly `0o555`, jar exactly `0o444`. Setuid/setgid/sticky fail `Permissions` (test covers `0o4555`).
- `NOFOLLOW` walk. Absolute path required. `Prefix`, `.`, and `..` rejected. Every component after `/` is `openat` with `NOFOLLOW`. A parent symlink fails closed (`Unavailable`).
- Parent trust. Directory owner must be root or `expected_owner`. Group/other write (`mode & 0o022`) is rejected unless sticky (`0o1000`). Leaf owner, `nlink == 1`, and exact mode are separate and stricter.
- `O_NONBLOCK` and `CLOEXEC` on the root, every directory, and the leaf. A FIFO leaf returns `NotRegular` without blocking before `fstat`.
- Digest plus `dev`/`ino`. `confirm` re-opens both paths and requires the whole `ApprovedFile` (kind, digest, dev, ino) to match. Same bytes with a recycled inode still match; different bytes fail `DigestMismatch` even if the inode number comes back. `start` calls `confirm` before the `Starting` transition (replaced runtime leaves the job `InputSealed` and admission open).
- Stop clearance. `unit_cleared` is only `Ok(Inactive | Failed)`. `Activating`, `Deactivating`, `Active`, `Unknown`, and `Err` quarantine. Tests cover `Activating` and `Deactivating`.
- Latch after a journal block. The old path memory-blocked and returned when admission was already closed. `rollback_units` now calls `quarantine_and_latch`, which uses `transition_internal` (does not require `AdmissionStatus::Open`) and then `block_durably`. Test `start_quarantines_when_running_persist_and_stop_fail` forces the `Running` persist to fail after the `Starting` commit and then fails stop: job `Quarantined`, admission `ReconciliationMismatch`, `durable_block` set.
- `#![forbid(unsafe_code)]` in `lib.rs` and `[lints.rust] unsafe_code = "forbid"`. No `unsafe` in the crate. The journal skip counter is `cfg(test)` only; production still directory-fsyncs after rename.
- `FakeSystemd` is an in-memory map in the library, not PID 1. Hosted tests do not attest real D-Bus, cgroup, or mount flags.

## Prior P2s

Both closed on this head. Not re-opened.

- Stop clearance: `Activating` / `Deactivating` used to count as “left Active”. They now quarantine and latch.
- Failed stop after a journal block: a memory `JournalFailure` used to skip quarantine and the durable gate. `quarantine_and_latch` still runs.

## Checked, not scored

- `quarantine_and_latch` forces the in-memory admission reason to `ReconciliationMismatch` even when the gate write failed (`durable_block` stays `None`). `allocate` / `transition` still see a non-`Open` admission, so this does not resume jobs or record `Running`. Restart stays `RecoveryPending` until reconcile.
- When stop does clear but the `Running` persist already blocked admission, the job stays `Starting` and the original journal error is returned. That avoids a second commit that would claim `Terminal` after an unknown rename outcome. Admission stays closed.
- `35b8ce7` only adjusts the runtime replacement test for tmpfs inode reuse. Production `confirm` still rejects digest drift.

## Residuals (not findings)

- No zbus adapter and no real PID 1 call in this SHA. `FakeSystemd` must not be wired as the production controller.
- Effective cgroup, mount attestation, quota, and `Ready` remain `003B-4C` / the rest of `003B-4B`. `003B-4B-4` and the aggregate `003B-4B` stay open.
- Sandbox properties (`NoNewPrivileges`, user/group, non-world-writable tmpfs `mode=`) belong with the D-Bus property list. This cut’s fixed options already include `nosuid,nodev,noexec` and the 48 MiB / 1024 inode caps; PID 1 is not invoked.
- `confirm` re-opens by path and does not hold an fd across a future exec. Parent trust plus confirm-before-`Starting` is the control this cut implements.

## Conclusion

Head `35b8ce711a6c07e7a1aa5e4b418c9031f9024070` keeps the fail-closed daemon path: derived unit identity, `Unknown` blocked before `Running`, approved runtime pinned by mode, owner, links, digest, and identity, and rollback that quarantines unless both units are `Inactive` or `Failed`. No P0–P3. `APPROVED` for the security lane. This file is not a GitHub approval, merge, or `Ready` declaration.
