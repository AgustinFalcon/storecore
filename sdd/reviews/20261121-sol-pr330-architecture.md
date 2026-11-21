VERDICT: APPROVED

## Evidence identity

- provider: Cursor
- model: grok-4.7-medium-fast
- effort: medium
- substitute-for: gpt-5.6-sol-medium (user-authorized; Sol usage limit)
- lane: architecture
- PR: 330 OPEN `feat(media): derive non-world-writable tmpfs and NoNewPrivileges` https://github.com/AgustinFalcon/storecore/pull/330
- branch: `feat/media-broker-4b3-sandbox-20261121`
- head SHA: `e2978566a7aa6d77abece4f6e724bda4b21fe6a3`
- `git rev-parse HEAD`: `e2978566a7aa6d77abece4f6e724bda4b21fe6a3` (matches required head)
- base SHA (`origin/master`, merge-base, three-dot): `4cbd801109e060b1918de55eb1ef16abcc2589da`
- Verify: run `44952793361` (`pull_request`, name `Verify`, status `completed`, conclusion `success`, `headSha` equals this head)
- job conclusions (all `completed` / `success`, none `cancelled`):
  - `repository-hygiene` `136994196621` success
  - `backend` `136994252666` success
  - `media-broker` `136994252712` success
  - `frontend` `136994252690` success
  - `productive-routes-real-e2e` `136994252754` success
  - `unified-access-real-e2e` `136994252647` success
- local `cargo` not run. The crate is Linux-only and this host is Windows. Focused validation is the hosted `media-broker` job on this SHA.

## Diff reviewed

`git diff origin/master...HEAD`: 3 files, 38 insertions, 11 deletions. One commit, `e297856`.

| File | Role |
| --- | --- |
| `backend/media-broker/src/systemd.rs` | `tmpfs_options` and `DIRECTORY_MODE` |
| `backend/media-broker/src/dbus.rs` | `DirectoryMode` and `NoNewPrivileges` on the property bag |
| `sdd/wip/20261116-catalog-media-upload-and-variant-gallery/4-implementation/progress.md` | records the residual as still open |

`plan.md` is not in the diff. `003B-4B-3` remains `[ ]`.

## Why this cut

`003B-4B-3` (plan, ADR-001 §4B-3, progress 2026-11-21) still requires a hardened daemon whose unit names, paths, and properties are derived internally. The security review of PR 328 (`sdd/reviews/20261121-sol-pr328-security.md`, head `7155a8e`, `VERDICT: APPROVED`) left this residual: the property bag set `User`/`Group` and `nosuid,nodev,noexec,size=48M,nr_inodes=1024`, and did not set `NoNewPrivileges` or a non-world-writable tmpfs `mode=`.

This SHA only closes that property residual. It does not check off `003B-4B-3`, `003B-4C`, `Ready`, or catalog HTTP. `FakeSystemd` remains the in-memory double.

## Focused validation (this SHA)

Hosted `media-broker` job `136994252712`, all steps `success`:

- `Verify broker format, lints and Linux tests with the lockfile`
- `Verify broker dependency licenses`
- `Generate broker CycloneDX SBOM`
- `Fail closed on HIGH and CRITICAL broker CVEs`

No local test count is claimed.

## Architecture

`TransientUnits::derive` is still the only constructor of `MountSpec`. Fields stay private. `BrokerDaemon::start` still accepts only job id, revision, caller principal, and time. It passes `self.worker` into `derive`, not the caller principal. The caller principal remains the CAS authority check.

`tmpfs_options` is private. The option string is the fixed prefix `nosuid,nodev,noexec,size=48M,nr_inodes=1024,mode=03770,uid=0,gid=` plus `Principal::gid()`, a `u32`. That integer cannot add another mount option. `uid=0` and `mode=03770` are literals. `DIRECTORY_MODE` is `0o3770` and is assigned inside `derive`, not taken from a parameter.

`mount_properties` copies that string into `Options` and copies `directory_mode()` into `DirectoryMode`. `worker_properties` appends `NoNewPrivileges` as the literal `true`. Property keys stay `'static`. There is no setter and no client property map. `NoNewPrivileges` is not a field on `WorkerSpec`, so a caller cannot pass false.

`03770` is owner `rwx`, group `rwx`, other none, with the set-gid bit. Other has no access, so the tmpfs root and the mount-point directory systemd creates are not world-writable. Group `rwx` matches the daemon worker gid already used for `User`/`Group`. The mount options still include `nosuid,nodev,noexec`. The set-uid bit on a directory does not change credentials on Linux, and `nosuid` stays on the mount.

`start_transient` still builds the bag with `properties(kind, spec)` and still calls only the existing manager methods. This diff does not add a client command, unit name, `Where`, or `ExecStart` argument.

## Findings

No P0. No P1. No P2. No P3.

## Residuals (not findings)

- `003B-4B-3` stays unchecked. So do `003B-4B-4`, aggregate `003B-4B`, `003B-4C`, and TASK-005. This SHA does not attest the effective mount mode, cgroup, namespaces, socket family, `ProtectSystem`, quota, or `NoNewPrivileges` on a real unit. `Ready`, catalog HTTP, secrets, deploy, tag, and publish stay out of scope.
- `ProtectSystem` remains unset. PR 328 named it next to this residual. It belongs to the still-open sandbox, not to this property cut.
- ADR-001 still describes the tmpfs as `nosuid,nodev,noexec` with a 48 MiB and inode cap. The progress note, not the ADR, records `mode=03770`, `uid=0`, `gid=<worker>`, and `DirectoryMode=03770`. The code constant is the derivation. This cut does not claim the ADR's `Ready` attestation.
- Tests lock `directory_mode() == 0o3770` and the substrings `mode=03770` and `gid=2000`, and they reject `mode=0777`. They do not decode the zbus `DirectoryMode` or `NoNewPrivileges` variants. Both values are a direct copy of the constant and a boolean literal.
- `size=48M` remains a literal beside `MOUNT_BYTES`. That split predates this commit.

## Conclusion

Head `e2978566a7aa6d77abece4f6e724bda4b21fe6a3` derives `mode=03770,uid=0,gid=<worker>`, `DirectoryMode=03770`, and worker `NoNewPrivileges=true` inside the broker. The client still cannot supply those properties. No P0–P3. `APPROVED` for the architecture lane. This file is not a GitHub approval, a merge, or a `Ready` declaration, and it does not check off `003B-4B-3`.
