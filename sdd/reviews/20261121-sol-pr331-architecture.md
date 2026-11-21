VERDICT: APPROVED

## Evidence identity

- provider: Cursor
- model: grok-4.7-medium-fast
- effort: medium
- substitute-for: gpt-5.6-sol-medium (user-authorized)
- lane: architecture
- PR: 331 https://github.com/AgustinFalcon/storecore/pull/331
- title: `feat(media): derive ProtectSystem=strict for worker units`
- git rev-parse HEAD reviewed: `32d6c7c8fceb981e9a038c55a878c64047052567`
- origin/master: `8b97626d54bb8cc00b18c090e725a47dee802eaf`
- merge-base with origin/master: `cc19634783ba2c59c8cd44365a37496bb5dd1dda`
- Verify: `44955708647` (`pull_request`, completed, success, headSha `32d6c7c8fceb981e9a038c55a878c64047052567`, display title matches this PR)
- local cargo: not re-run and not claimed
- prior architecture verdict superseded: CHANGES_REQUIRED on `2a3175b0769654523d5f5aaba3874db27b543a32` (P1: `ProtectSystem=strict` without a derived `ReadWritePaths`; test was key-only)

## Job conclusions (Verify 44955708647)

Six jobs, all `completed` / `success` on `32d6c7c8fceb981e9a038c55a878c64047052567`. None cancelled:

- repository-hygiene: success (`137003195094`)
- backend: success (`137003273281`)
- unified-access-real-e2e: success (`137003273282`)
- media-broker: success (`137003273312`)
- productive-routes-real-e2e: success (`137003273314`)
- frontend: success (`137003273385`)

## Diff read

`git diff origin/master...HEAD` is only `backend/media-broker/src/dbus.rs` (+26/−1). That net diff is `2a3175b` plus `32d6c7c`. `00d7ea7` and merge `8b97626` are on `origin/master` and are not in this HEAD. `plan.md` on this SHA still has `003B-4B-3` unchecked. This review does not check off `003B-4B-3`, `003B-4C`, `Ready`, or catalog HTTP.

## Why this cut

The PR body is the residual of making the worker unit send an internally derived `ProtectSystem=strict`, then keeping the job tmpfs writable under that setting. Both literals are set in `worker_properties`, the D-Bus translator. `TransientUnits::derive` still takes only job id, mount root, principal, and `ApprovedRuntime`. No new argument can carry a sandbox property. `003B-4B-3` stays open: no PID 1 in CI, no cgroup attestation, no `Ready`, no HTTP.

## P1 closed

`worker_properties` builds one `workspace` string from `spec.mount().where_path()`, the same `Where` the mount bag sends. It uses that string for `WorkingDirectory` and as the sole element of `ReadWritePaths` (`Value::from(vec![workspace])`), the same array-of-strings shape as `Requires` / `After`. `ProtectSystem` is the internal literal `strict`. The client cannot supply either property.

`properties` still selects that bag only for `UnitKind::Worker`. `ZbusSystemd::start` still sends the bag unchanged as the `StartTransientUnit` property list. `FakeSystemd` remains the daemon test double and does not apply the bag.

`derived_properties_never_include_a_client_exec_or_where` locks the key and the Debug form of `ProtectSystem` so it contains `strict`, and locks `ReadWritePaths` so its Debug form contains `spec.mount().where_path()`.

## Findings

None. The previous P1 is closed on this SHA.

## Residuals (not findings)

`003B-4B-3`, `003B-4B-4`, aggregate `003B-4B`, `003B-4C`, `MEDIA-NORMALIZE-003B-4`, TASK-005, and issue #7 stay open. No `Ready`, no PID 1 in CI, no Spring wiring, no HTTP, no secrets, no deploy, no tag, no publish. `FakeSystemd` stays the test double. `PrivateTmp`, `ProtectHome`, and syscall filters stay outside this cut.

## Standards applied

Closed unit/D-Bus kinds stay in `UnitKind`. The sandbox literals belong in this one translator. `sdd/reviews/20261120-sol-pr320-architecture.md` and `20261121-sol-pr326-architecture.md`: internal derivation, `Unknown` fail-closed, and no gate check-off from a property-bag slice. This slice keeps that boundary and restores the worker write exception the same specs require.
