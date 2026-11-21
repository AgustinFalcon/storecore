VERDICT: APPROVED

## Evidence identity

- provider: Cursor
- model: grok-4.7-medium-fast
- effort: medium
- substitute-for: gpt-5.6-sol-medium (user-authorized)
- lane: security
- PR: 331 OPEN `feat(media): derive ProtectSystem=strict for worker units` https://github.com/AgustinFalcon/storecore/pull/331
- branch: `feat/media-broker-4b3-protectsystem-20261121`
- head SHA: `32d6c7c8fceb981e9a038c55a878c64047052567`
- `git rev-parse HEAD`: `32d6c7c8fceb981e9a038c55a878c64047052567` (matches required head)
- base SHA: `origin/master` `8b97626d54bb8cc00b18c090e725a47dee802eaf`; merge-base `cc19634783ba2c59c8cd44365a37496bb5dd1dda`
- prior security file on `2a3175b0769654523d5f5aaba3874db27b543a32` is superseded by this re-review
- architecture P1 on that prior head: `ProtectSystem=strict` with no derived write exception for the job tmpfs. This head adds `ReadWritePaths` from the same `where_path` as `WorkingDirectory`.
- Verify: run `44955708647` (`pull_request`, name `Verify`, status `completed`, conclusion `success`, `headSha` equals this head)
- job conclusions (all `completed` / `success`, none `cancelled`):
  - `repository-hygiene` `137003195094` success
  - `backend` `137003273281` success
  - `unified-access-real-e2e` `137003273282` success
  - `media-broker` `137003273312` success
  - `productive-routes-real-e2e` `137003273314` success
  - `frontend` `137003273385` success
- local `cargo` not run. The crate is Linux-only and this host is Windows. Focused validation is the hosted `media-broker` job on this SHA.

## Diff reviewed

`git diff origin/master...HEAD`: 1 file, `backend/media-broker/src/dbus.rs`, +26/−1. Commits on this side of the merge-base are `2a3175b` (literal `ProtectSystem=strict`) and `32d6c7c` (`ReadWritePaths` of the derived workspace). `plan.md`, `progress.md`, `STATUS.md`, the protocol, and the capability factory are outside the diff. On this head `plan.md` still has `- [ ] 003B-4B-3`.

## Why this cut

PR body: residual of PR #328 security. Worker transient units send internally derived `ProtectSystem=strict`, and the job tmpfs stays the one writable exception. The client still cannot supply unit names, paths, commands, or sandbox properties. The body does not check off `003B-4B-3`, `003B-4C`, `Ready`, or catalog HTTP. `FakeSystemd` remains the test double. CI does not open the system bus.

## Focus checks (this SHA)

No P0–P3. The architecture P1 is closed in `worker_properties`.

- `ProtectSystem` is the internal literal `strict`. The only production assignment is `Value::from("strict".to_owned())` on the `'static` key `"ProtectSystem"`. It is not read from the job, the principal, the runtime path, or the wire. `properties` includes that bag only for `UnitKind::Worker`. `UnitKind::Mount` still returns `mount_properties`. `UnitKind::Unknown` still fails closed.
- `ReadWritePaths` is the derived job `Where`, the same string as `WorkingDirectory`. Both use `workspace`, taken from `spec.mount().where_path()`. `WorkingDirectory` receives `workspace.clone()`. `ReadWritePaths` receives `Value::from(vec![workspace])`, one element, the same binding. `TransientUnits::derive` builds that path as `mount_root` plus the job hex. The daemon passes `self.mount_root`, not a client path.
- The client cannot supply either property. `worker_properties` takes only `&TransientUnits`. `derive` takes job id, mount root, principal, and `ApprovedRuntime`. `BrokerDaemon::start` takes job id, expected revision, caller principal, and time. That principal is compared to the sealed record and is not copied into these two properties. `BrokerRequest` remains operation, job id, revision, digest, and size. `ZbusSystemd::start` sends `properties(kind, spec)` and an empty auxiliary vector. Property keys are `'static` literals. There is no client map merged into the bag. The mount bag is unchanged (`DirectoryMode`, `mode=03770`).
- No `Ready`, HTTP, or secrets. The diff does not touch the capability factory, catalog HTTP, or credential material. `MediaWorkerCapability.Ready` is not produced here. `ArtifactReady` is an existing protocol result and is outside this diff. `plan.md` leaves `003B-4B-3` unchecked.

## Checked, not scored

- `derived_properties_never_include_a_client_exec_or_where` locks `ProtectSystem` by requiring the debug form to contain `strict`, and locks `ReadWritePaths` by requiring it to contain `spec.mount().where_path()`. The production assignment is the literal and the one-element vector of that same path. Hosted `media-broker` on this SHA ran that test successfully.
- `FakeSystemd` still stores unit state only. It does not evaluate the property bag. The hosted job does not call `ZbusSystemd::connect_system`.

## Residuals (not findings)

- `003B-4B-3`, `003B-4B-4`, the aggregate `003B-4B`, and `003B-4C` stay open. No `Ready`, no catalog HTTP, no deploy, no secrets. This file is not a GitHub approval, a merge, or a `Ready` declaration.
- Attestation still reads `ActiveState` only. This bag requests `ProtectSystem=strict` and a single `ReadWritePaths` entry. It does not prove PID 1 applied either. `PrivateTmp`, `ProtectHome`, syscall filters, cgroup, quota, and mount attestation stay inside the open `003B-4B` / `003B-4C` work.
- `mode=03770`, `DirectoryMode`, and `NoNewPrivileges=true` are unchanged. This SHA does not let the client replace them.

## Conclusion

Head `32d6c7c8fceb981e9a038c55a878c64047052567` closes the P1: the worker bag sets `ProtectSystem` to the internal literal `strict` and `ReadWritePaths` to the derived job `Where` already used as `WorkingDirectory`. The client still cannot supply either. No P0–P3. `APPROVED` for the security lane. `003B-4B-3` stays open.
