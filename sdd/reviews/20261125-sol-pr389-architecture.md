VERDICT: APPROVED

## Evidence identity

- provider: xAI
- model: Grok 4.7
- effort: medium
- substitute-for: gpt-5.6-sol-medium (no quota)
- lane: architecture
- independent of the security lane. This review did not read `sdd/reviews/20261125-sol-pr389-security.md`
- PR: 389 OPEN `fix(media): leave ProtectHome unset after PID 1 ENXIO` https://github.com/AgustinFalcon/storecore/pull/389
- branch: `feat/media-broker-4c-protect-home-20261125`
- head SHA: `c847ca92a103397ca0c1178df4bdddbbd9f46e02` (`gh pr view 389` `headRefOid`; `git rev-parse HEAD` on that branch). Subject: `fix(media): leave ProtectHome unset after PID 1 ENXIO`
- base / `origin/master`: `f91d576cedfb83e87b6402b132798ed31d76664a` (`gh` `baseRefOid` and `git rev-parse origin/master`). Subject: `docs: persist PR 387 dual Grok reviews without closing 4C (#388)`. `git merge-base origin/master HEAD` is that same master SHA
- two commits on the merge-base: `cf554af2a6589feeb775c987ce2a8e26703f2d02` then `c847ca92a103397ca0c1178df4bdddbbd9f46e02`
- diff identity: `git diff --name-status origin/master...HEAD` is three paths, +90 / −8. `git diff --check origin/master...HEAD` exit 0
- `gh pr view 389`: `OPEN`, base `master`, head `feat/media-broker-4c-protect-home-20261125`. The PR body still leaves hosted Verify, the dual reviews, and the `003B-4C` / TASK-005 / HTTP close-out unchecked. This review does not edit that body and does not check those boxes
- worktree at review time was already `feat/media-broker-4c-protect-home-20261125` at `c847ca92a103397ca0c1178df4bdddbbd9f46e02`. No checkout
- untracked persist-of-persist leftovers (`sdd/reviews/20261124-sol-pr365-*.md`, `20261124-sol-pr373-*.md`, `20261125-sol-pr376-*.md`, `20261125-sol-pr378-*.md`, `20261125-sol-pr380-*.md`, `20261125-sol-pr382-*.md`, `20261125-sol-pr384-*.md`, `20261125-sol-pr386-*.md`, `20261125-sol-pr388-*.md`) are outside this three-dot diff and were not staged
- this file is not a GitHub approval, does not close `003B-4C`, and must stay untracked

## Job conclusions (Verify 45627692228)

`gh pr checks 389` and `gh run view 45627692228`: event `pull_request`, name `Verify`, status `completed`, conclusion `success`, headSha `c847ca92a103397ca0c1178df4bdddbbd9f46e02`. Seven jobs, all `completed` / `success`. None cancelled.

- repository-hygiene `139252173112`: `completed` / `success`
- backend `139252316077`: `completed` / `success`
- media-broker `139252316136`: `completed` / `success`
- media-broker-pid1 `139252316157`: `completed` / `success`
- frontend `139252316096`: `completed` / `success`
- productive-routes-real-e2e `139252316162`: `completed` / `success`
- unified-access-real-e2e `139252316120`: `completed` / `success`

The PR body still leaves the hosted-Verify checkbox open. This review records the run and does not edit that body.

`media-broker` (`139252316136`), step “Verify broker format, lints and Linux tests with the lockfile”, ran `dbus::tests::derived_worker_protect_home ... ok` and then `test result: ok. 65 passed; 0 failed; 18 ignored`. The following results in that step were 5, 4, and 4 passed.

`media-broker-pid1` (`139252316157`), step “Start derived tmpfs and worker units through PID 1”, lib unittests `src/lib.rs`: `running 18 tests`, `dbus::tests::pid1_worker_protect_home ... ok`, then `test result: ok. 18 passed; 0 failed; 0 ignored; 0 measured; 65 filtered out`.

First head `cf554af2a6589feeb775c987ce2a8e26703f2d02` is Verify `45624972507`, event `pull_request`, conclusion `failure`. Only `media-broker-pid1` `139242785861` failed. Its lib result is `3 passed; 15 failed`. Each of those 15 failures is `StartTransientUnit` `System.Error.ENXIO: Failed to set unit properties: Unexpected message contents`, including the panic `StartTransientUnit rejected derived ProtectHome`. That head sent `ProtectHome=true` inside the shared worker property list, so every worker start failed, not only the new test. Fix commit `c847ca9` removes that key.

## Diff reviewed

`git diff origin/master...HEAD`: 3 files, +90 / −8. No Kotlin, Angular, workflow, migration, fixture, lockfile, HTTP route, or secret. `plan.md`, `spec.md`, ADR-001, and `meta.md` are not in this diff. Persist-of-persist of 365/373/376/378/380/382/384/386/388 is not in the diff.

The net diff does not edit `worker_properties`. On this SHA the vector still ends at `PrivateNetwork=true` and `PrivateTmp=true`. `ProtectHome` is absent. `git show c847ca9` is the removal of `("ProtectHome", Value::from(true))` that `cf554af` had appended, plus the flip of both new tests from “must be true” to “must stay unset”.

| File | change |
| --- | --- |
| `backend/media-broker/src/dbus.rs` | New unit test `derived_worker_protect_home` asserts the key is absent. New ignored PID 1 test `pid1_worker_protect_home` starts the derived worker and asserts `ProtectHome` reads `no`, `false`, or empty. The production property list is unchanged versus `origin/master` |
| `sdd/STATUS.md` | implementation banner becomes “4C ProtectHome queda fuera”. Says this cut does not close `003B-4C`. Records PID 1 `ENXIO` Unexpected message contents, same as `RestrictAddressFamilies` and `CPUQuota`. Leaves socket family, global quota, terminals without ACK, FD/mmap after seal, restart, remaining RLIMIT, and `Ready` out |
| `sdd/wip/.../4-implementation/progress.md` | one “arranque” entry. Says `ProtectHome` stays out for that `ENXIO`. Says `003B-4C` is not marked. No socket family, global quota, `Ready`, or media HTTP |

## Why this cut

PR title and body record that PID 1 rejects `ProtectHome` in the property list with `ENXIO` Unexpected message contents, the same rejection already recorded for `RestrictAddressFamilies` and `CPUQuota`. The fix leaves the key unset so worker units start. Derived and PID 1 tests lock that it stays out. The body says `003B-4C` stays open: socket family, global quota, ACK, FD/mmap, remaining RLIMIT, and Ready stay out, and there is no media HTTP.

ADR-001 still requires namespaces, no AF_INET/AF_INET6, `CPUQuota`, RLIMIT, and SELF_TEST `Matched` inside the unit before `Ready`. `ProtectHome` is one sandbox property that this PID 1 will not accept on `StartTransientUnit`. This cut does not attest `ProtectHome=true` and does not satisfy that Ready set. Versus `origin/master`, the worker property list is unchanged, so the cut does not weaken a property that master already applied.

`worker_properties` takes only `&TransientUnits`. `properties` selects it for `UnitKind::Worker`. `ZbusSystemd::start_transient` sends that vector to `StartTransientUnit`. `TransientUnits::derive` builds the spec from job id, mount root, principal, and approved runtime. Callers cannot supply unit names, `Where`, `ExecStart`, or this boolean. There is no client property bag, and the key is not in the derived vector.

`derived_worker_protect_home` uses `JobId::create([0xab; 16])`, asserts `ProtectHome` is absent, and asserts the key list still omits `RestrictAddressFamilies` and `CPUQuota`. It does not assert a true value. It is a new test.

`pid1_worker_protect_home` is ignored unless root, systemd PID 1, the approved Java/jar, and the system bus are present. It uses `JobId::create([0x14; 16])`, which is not reused by another PID 1 test in this file. It starts the derived mount and worker. If the start fails it dumps the unit and panics with “failed after leaving ProtectHome unset”. It then reads `systemctl show -p ProtectHome --value`. The accepted values are `no`, `false`, or empty. `yes` and `true` fail the assertion. `systemctl_property` already panics when `systemctl` exits non-zero, so empty is a successful show with no printed value, not a hidden `yes`. It then stops the worker and the mount.

## Honesty

STATUS and progress agree with the tree. `plan.md` on this SHA is unchanged:

- The cut records that PID 1 rejects `ProtectHome` with `ENXIO`. It does not attest `ProtectHome=true`.
- `003B-4C` stays open. The banner says this cut does not close it. Progress says it is not marked. `plan.md` line 89 is still `- [ ] MEDIA-NORMALIZE-003B-4C`.
- `CPUQuota` stays unset. `RestrictAddressFamilies` stays unset. The unit test asserts both keys, and `ProtectHome`, are absent. `LimitCPU` remains the existing RLIMIT. `PrivateNetwork` and `PrivateTmp` stay the existing derived booleans.
- Global quota, socket family, terminals without ACK, FD/mmap after seal, restart on every durable transition, remaining RLIMIT, and `Ready` stay absent.
- `003B-4B-3` (line 84), `003B-4B-4` (line 87), `MEDIA-NORMALIZE-003B-4` (line 55), `MEDIA-NORMALIZE-004` (line 93), and TASK-005 (line 16) stay `[ ]`.
- No media HTTP, no inject-ready claim, no capability unblock, and no `store_id`.
- `spec.md` on this SHA still says no isolated sub-cut enables `Ready`, and that `003B-4C` must prove SELF_TEST/NORMALIZE, isolation, per-job and global quota, terminals without ACK, FD/mmap after seal, OOM/timeout, cgroup termination, substitution rejection, and restart on every durable transition. Only `003B-4A+4B+4C` can complete `003B-4`. Those files are unchanged.

Closed-domain, Android, and Spring/Kotlin standards do not gain a new state or layer. `UnitKind` stays the closed edge. `ProtectHome` is not added as a derived D-Bus property. No view, store, controller, or stringly status was added.

## Findings

No P0. No P1. No P2. No P3. The cut does not claim inject-ready and does not close `003B-4C`, Ready, HTTP, `003B-4B-3`, `003B-4B-4`, or TASK-005. `ProtectHome` stays unset. `CPUQuota` stays unset.

## Verdict

APPROVED. The shared worker property list leaves `ProtectHome` unset after PID 1 `ENXIO`, the tests lock that absence, and the residual gates stay open. This file is not a GitHub approval.
