VERDICT: APPROVED

## Evidence identity

- provider: xAI
- model: Grok 4.7
- effort: medium
- substitute-for: gpt-5.6-sol-medium (no quota)
- lane: architecture
- independent of the security lane. This review did not read `sdd/reviews/20261125-sol-pr387-security.md`
- PR: 387 OPEN `feat(media): attest PID 1 PrivateTmp on the worker unit` https://github.com/AgustinFalcon/storecore/pull/387
- branch: `feat/media-broker-4c-private-tmp-20261125`
- head SHA: `733a6aeec08d58e5756d2c950bddc03ffcf91579` (`gh pr view 387` `headRefOid`; `git rev-parse HEAD` on that branch). Subject: `feat(media): attest PID 1 PrivateTmp on the worker unit`
- base / `origin/master`: `a8992dbdbcc5658a60a4cf11eb22d82ab321baa7` (`gh` `baseRefOid` and `git rev-parse origin/master`). Subject: `docs: persist PR 385 dual Grok reviews without closing 4C (#386)`. `git merge-base origin/master HEAD` is that same master SHA
- one commit on the merge-base: `733a6aeec08d58e5756d2c950bddc03ffcf91579`
- diff identity: `git diff --name-status origin/master...HEAD` is three paths, +96 / −5. `git diff --check` exit 0
- `gh pr view 387`: `OPEN`, base `master`, head `feat/media-broker-4c-private-tmp-20261125`, `changedFiles` 3. The PR body still leaves hosted Verify, the dual reviews, and the `003B-4C` / TASK-005 / HTTP close-out unchecked. This review does not edit that body and does not check those boxes
- worktree at review time was already `feat/media-broker-4c-private-tmp-20261125` at `733a6aeec08d58e5756d2c950bddc03ffcf91579`. No checkout
- untracked persist-of-persist leftovers (`sdd/reviews/20261124-sol-pr365-*.md`, `20261124-sol-pr373-*.md`, `20261125-sol-pr376-*.md`, `20261125-sol-pr378-*.md`, `20261125-sol-pr380-*.md`, `20261125-sol-pr382-*.md`, `20261125-sol-pr384-*.md`, `20261125-sol-pr386-*.md`) are outside this three-dot diff and were not staged
- this file is not a GitHub approval, does not close `003B-4C`, and must stay untracked

## Job conclusions (Verify 45574676365)

`gh pr checks 387` and `gh run view 45574676365`: event `pull_request`, name `Verify`, status `completed`, conclusion `success`, headSha `733a6aeec08d58e5756d2c950bddc03ffcf91579`. Seven jobs, all `completed` / `success`. None cancelled.

- repository-hygiene `139069543567`: `completed` / `success`
- backend `139069654945`: `completed` / `success`
- media-broker `139069655022`: `completed` / `success`
- media-broker-pid1 `139069654972`: `completed` / `success`
- frontend `139069654928`: `completed` / `success`
- productive-routes-real-e2e `139069654848`: `completed` / `success`
- unified-access-real-e2e `139069654904`: `completed` / `success`

The PR body still leaves the hosted-Verify checkbox open. This review records the run and does not edit that body.

`media-broker` (`139069655022`) ran `dbus::tests::derived_worker_private_tmp ... ok` inside the lib unittests (`64 passed; 0 failed; 17 ignored`).

`media-broker-pid1` (`139069654972`), step “Start derived tmpfs and worker units through PID 1”, lib unittests `src/lib.rs`: `running 17 tests`, `dbus::tests::pid1_worker_private_tmp ... ok`, then `test result: ok. 17 passed; 0 failed; 0 ignored; 0 measured; 64 filtered out`.

## Diff reviewed

`git diff origin/master...HEAD`: 3 files, +96 / −5. No Kotlin, Angular, workflow, migration, fixture, lockfile, HTTP route, or secret. `plan.md`, `spec.md`, ADR-001, and `meta.md` are not in this diff. Persist-of-persist of 365/373/376/378/380/382/384/386 is not in the diff.

| File | change |
| --- | --- |
| `backend/media-broker/src/dbus.rs` | `worker_properties` appends `("PrivateTmp", Value::from(true))`. New unit test `derived_worker_private_tmp`. New ignored PID 1 test `pid1_worker_private_tmp`. `derived_worker_oom_kills_the_cgroup` is untouched |
| `sdd/STATUS.md` | implementation banner becomes “4C PrivateTmp del worker”. Says this cut does not close `003B-4C`. Names `PrivateTmp=true` read by PID 1. Leaves `CPUQuota` and `RestrictAddressFamilies` out, and leaves socket family, global quota, terminals without ACK, FD/mmap after seal, restart, remaining RLIMIT, and `Ready` out |
| `sdd/wip/.../4-implementation/progress.md` | one “arranque” entry. Says `003B-4C` is not marked. No socket family, global quota, `Ready`, or media HTTP |

## Why this cut

PR title and body derive `PrivateTmp=true` inside `worker_properties`. The client does not supply it. PID 1 reads the effective property. `CPUQuota` and `RestrictAddressFamilies` stay unset. The body says `003B-4C` stays open: socket family, global quota, ACK, FD/mmap, remaining RLIMIT, and Ready stay out, and there is no media HTTP.

ADR-001 still requires namespaces for `Ready`, together with no AF_INET/AF_INET6, `CPUQuota`, RLIMIT, and SELF_TEST `Matched` inside the unit. `PrivateTmp=true` is one namespace-ish property: PID 1 gives the worker unit a private `/tmp` and `/var/tmp`. It is not `RestrictAddressFamilies` and it is not `CPUQuota`. `PrivateNetwork=true` and `LimitCPU` were already derived. This cut does not satisfy the Ready namespace set.

`worker_properties` takes only `&TransientUnits`. `properties` selects it for `UnitKind::Worker`. `ZbusSystemd::start_transient` sends that vector to `StartTransientUnit`. `TransientUnits::derive` builds the spec from job id, mount root, principal, and approved runtime. Callers cannot supply unit names, `Where`, `ExecStart`, or this boolean. The new key is `Value::from(true)` at the derivation site. There is no client property bag.

`derived_worker_private_tmp` uses `JobId::create([0xab; 16])`, asserts the key `PrivateTmp`, asserts the debug form contains `true`, and asserts the key list still omits `RestrictAddressFamilies` and `CPUQuota`. It is a new test. `derived_worker_oom_kills_the_cgroup` is not extended. The media-broker job’s format and lint step passed with that split.

`pid1_worker_private_tmp` is ignored unless root, systemd PID 1, the approved Java/jar, and the system bus are present. It uses `JobId::create([0x13; 16])`, starts the derived mount and worker, and reads `systemctl show -p PrivateTmp --value`. The accepted values are `yes` or `true`. It then stops the worker and the mount. That job id is not reused by another PID 1 test in this file.

## Honesty

STATUS and progress agree with the tree. `plan.md` on this SHA is unchanged:

- The cut is one derived `PrivateTmp=true`, read back by PID 1. It is one namespace-ish property. It does not close the ADR namespace requirement.
- `003B-4C` stays open. The banner says this cut does not close it. Progress says it is not marked. `plan.md` line 89 is still `- [ ] MEDIA-NORMALIZE-003B-4C`.
- `CPUQuota` stays unset. `RestrictAddressFamilies` stays unset. The unit test asserts both keys are absent. `LimitCPU` remains the existing RLIMIT.
- Global quota, socket family, terminals without ACK, FD/mmap after seal, restart on every durable transition, remaining RLIMIT, and `Ready` stay absent.
- `003B-4B-3` (line 84), `003B-4B-4` (line 87), `MEDIA-NORMALIZE-003B-4` (line 55), `MEDIA-NORMALIZE-004` (line 93), and TASK-005 (line 16) stay `[ ]`.
- No media HTTP, no inject-ready claim, no capability unblock, and no `store_id`.
- `spec.md` on this SHA still says no isolated sub-cut enables `Ready`, and that `003B-4C` must prove SELF_TEST/NORMALIZE, isolation, per-job and global quota, terminals without ACK, FD/mmap after seal, OOM/timeout, cgroup termination, substitution rejection, and restart on every durable transition. Only `003B-4A+4B+4C` can complete `003B-4`. Those files are unchanged.

Closed-domain, Android, and Spring/Kotlin standards do not gain a new state or layer. `UnitKind` stays the closed edge. `PrivateTmp` is a derived D-Bus property at the systemd boundary, the same shape as `PrivateNetwork`. No view, store, controller, or stringly status was added.

## Findings

No P0. No P1. No P2. No P3. The cut does not claim inject-ready and does not close `003B-4C`, Ready, HTTP, `003B-4B-3`, `003B-4B-4`, or TASK-005. `CPUQuota` stays unset.

## Verdict

APPROVED. One derived namespace-ish property, attested by PID 1, with the residual gates left open. This file is not a GitHub approval.
