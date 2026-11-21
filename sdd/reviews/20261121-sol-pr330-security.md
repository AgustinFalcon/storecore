VERDICT: APPROVED

## Evidence identity

- provider: Cursor
- model: grok-4.7-medium-fast
- effort: medium
- substitute-for: gpt-5.6-sol-medium (user-authorized; Sol usage limit)
- lane: security
- PR: 330 OPEN `feat(media): derive non-world-writable tmpfs and NoNewPrivileges` https://github.com/AgustinFalcon/storecore/pull/330
- branch: `feat/media-broker-4b3-sandbox-20261121`
- head SHA: `e2978566a7aa6d77abece4f6e724bda4b21fe6a3`
- `git rev-parse HEAD`: `e2978566a7aa6d77abece4f6e724bda4b21fe6a3` (matches required head)
- base SHA reviewed (`origin/master`, merge-base, three-dot): `4cbd801109e060b1918de55eb1ef16abcc2589da`
- prior lane: PR 328 security `sdd/reviews/20261121-sol-pr328-security.md` on head `7155a8e6c755b55d5d0bbc7e9578c151370deffd`, `VERDICT: APPROVED`. Residual carried here: the property bag set `User` / `Group` and `nosuid,nodev,noexec,size=48M,nr_inodes=1024`, and did not set `NoNewPrivileges` or a non-world-writable tmpfs `mode=`.
- ADR-001: per-job tmpfs is `nosuid,nodev,noexec` with a byte and inode cap; attestation of effective `NoNewPrivileges` remains a later proof. This cut only fills the requested property bag.
- Verify: run `44952793361` (`pull_request`, name `Verify`, status `completed`, conclusion `success`, `headSha` equals this head)
- job conclusions (all `completed` / `success`, none `cancelled`):
  - `repository-hygiene` `136994196621` success
  - `backend` `136994252666` success
  - `media-broker` `136994252712` success
  - `frontend` `136994252690` success
  - `productive-routes-real-e2e` `136994252754` success
  - `unified-access-real-e2e` `136994252647` success
- local `cargo` not run. The crate is `#![cfg(target_os = "linux")]` and this host is Windows. Focused validation is the hosted `media-broker` job on this SHA.

## Diff reviewed

`git diff origin/master...HEAD`: 3 files, 38 insertions, 11 deletions. One commit: `e297856` `feat(media): derive non-world-writable tmpfs and NoNewPrivileges`.

| File | change |
| --- | --- |
| `backend/media-broker/src/systemd.rs` | 34 |
| `backend/media-broker/src/dbus.rs` | 8 |
| `sdd/wip/20261116-catalog-media-upload-and-variant-gallery/4-implementation/progress.md` | 7 |

Full three-dot diff read, then `TransientUnits::derive`, `tmpfs_options`, `BrokerDaemon::start`, `mount_properties`, `worker_properties`, `ZbusSystemd::start`, and `Principal`. `plan.md` is outside the diff and still leaves `003B-4B-3` unchecked. Progress on this head says the same: no PID 1 in CI, no cgroup, no `Ready`, no HTTP.

## Why this cut

`003B-4B-3` residual from the PR 328 security review: the transient mount must not rely on tmpfs's default world-writable root, and the worker service must request `NoNewPrivileges`. Callers still cannot supply unit names, paths, methods, commands, or these sandbox properties. `FakeSystemd` stays the in-memory double. This sub-cut does not return `Ready` and does not replace `003B-4C`.

## Focus checks (this SHA)

No P0–P3.

- Client cannot supply the mode, `DirectoryMode`, gid, or `NoNewPrivileges`. `MountSpec` fields stay private. The only constructor is `TransientUnits::derive(job_id, mount_root, worker, runtime)`. `BrokerDaemon::start` still takes job id, expected revision, caller principal, and time. That principal is compared to the sealed record and is not passed into `derive`. `derive` uses `self.worker`, the principal stored on the daemon at `BrokerDaemon::new`. `BrokerRequest` remains the fixed 72-byte frame (operation, job id, revision, digest, size) and has no property field. `ZbusSystemd::start` sends `properties(kind, spec)` plus an empty auxiliary vector. Property keys are `'static` literals. There is no client map merged into the bag.
- Mode is not world-writable. `DIRECTORY_MODE` is `0o3770` (setgid, sticky, owner `rwx`, group `rwx`, other `---`). `0o3770 & 0o007 == 0`, so other read, write, and execute are clear. `tmpfs_options` hardcodes `mode=03770,uid=0` and appends only `worker.gid()` as a decimal `u32`. The kernel tmpfs parser treats `mode=` as octal; `03770` is the same bit set. Group write is the worker gid, which is the cross-UID workspace, not other-write. The old fixed string without `mode=` is gone.
- Gid comes from the daemon worker `Principal`. `tmpfs_options(worker)` and the service `Group` property both read `worker.gid()` from that same principal. `uid=0` on the tmpfs root is a literal, not the caller uid. `User` / `Group` remain the daemon worker, unchanged from PR 328.
- `NoNewPrivileges` is true internally. `worker_properties` appends `("NoNewPrivileges", Value::from(true))`. It is not a parameter of `derive`, `start`, or the protocol. A rejected `StartTransientUnit` still fails closed (`mode=fail`) and `start_kind` still records `Running` only after start and `attest` are `Active`.
- No `Ready`, HTTP, or secrets. The diff does not touch the capability factory, catalog HTTP, or credential material. `MediaWorkerCapability.Ready` is not produced here. Progress states `003B-4B-3` stays open.

## Checked, not scored

- `derived_properties_never_include_a_client_exec_or_where` asserts that the keys `NoNewPrivileges` and `DirectoryMode` are present. It does not assert the boolean or the `u32`. The only production assignments are `Value::from(true)` and `DIRECTORY_MODE`.
- `transient_units_ignore_any_client_path_argument` locks `directory_mode() == 0o3770`, the substrings `mode=03770` and `gid=2000` for `Principal::create(2000, 2000)`, and the absence of `mode=0777`. The other-write bit is clear in the constant those asserts name.
- `FakeSystemd` still stores unit state only. It does not evaluate the property bag. The hosted job compiles and tests the derivation; it does not call `ZbusSystemd::connect_system`.

## Residuals (not findings)

- `ProtectSystem` is still unset. The PR 328 residual named it next to `NoNewPrivileges` and `mode=`. This SHA closes the mode and `NoNewPrivileges` parts only. Effective cgroup, namespaces, socket family, `KillMode`, quota, and mount attestation stay `003B-4C` / the rest of `003B-4B`.
- `003B-4B-3`, `003B-4B-4`, the aggregate `003B-4B`, and `003B-4C` stay open. No `Ready`, no catalog HTTP, no deploy, no secrets.
- `DirectoryMode` applies to mount-point parents systemd creates if they are missing. The mode is still `03770` (not other-writable). Owner and group of those parents are PID 1's, not a client choice. The visible job root after a successful mount is the tmpfs inode (`uid=0`, worker gid, `mode=03770`).
- Attestation still reads `ActiveState` only. This bag requests `NoNewPrivileges` and the mode; it does not prove PID 1 applied them.

## Conclusion

Head `e2978566a7aa6d77abece4f6e724bda4b21fe6a3` closes the PR 328 sandbox gap that was in scope for this cut. Tmpfs `mode=03770` and `DirectoryMode` `0o3770` leave other-write clear, the gid is the daemon worker principal, and `NoNewPrivileges` is the constant `true`. The client still cannot supply those properties. No P0–P3. `APPROVED` for the security lane. This file is not a GitHub approval, merge, or `Ready` declaration.
