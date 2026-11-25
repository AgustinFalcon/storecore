VERDICT: APPROVED

## Evidence identity

- provider: xAI
- model: Grok 4.7
- effort: medium
- substitute-for: gpt-5.6-sol-medium (no quota)
- lane: architecture
- independent of the security lane. This review did not read `sdd/reviews/20261125-sol-pr385-security.md`
- PR: 385 OPEN `feat(media): attest PID 1 LimitCPU on the worker unit` https://github.com/AgustinFalcon/storecore/pull/385
- branch: `feat/media-broker-4c-limit-cpu-20261125` (worktree left on this branch)
- head SHA: `792397cbdebf8e112c839ea3d16e37a427009752`
- `git rev-parse HEAD`: `792397cbdebf8e112c839ea3d16e37a427009752` (matches GitHub `headRefOid`)
- remote feature tip: `git ls-remote origin refs/heads/feat/media-broker-4c-limit-cpu-20261125` is the same SHA
- GitHub `baseRefOid` / `origin/master` / `git merge-base origin/master HEAD`: `97257c47ea20523f5f66dbae658bcc0e5a9a09d3` (`docs: persist PR 383 dual Grok reviews without closing 4C (#384)`)
- GitHub mergeability: `MERGEABLE`, `mergeStateStatus` `CLEAN`, state `OPEN`
- diff identity: `git diff --name-status origin/master...HEAD` is three modifications; `git diff --stat` is 3 files, +104 / −10; `git diff --check` exit 0 (no whitespace errors). Three commits on the merge-base: `9cc757bb1a1b0478aa0f13e3900d5adab7c4d95a` `feat(media): attest PID 1 LimitCPU on the worker unit`; `905ba297c834b0c0fe3f4307325f9d7814084a42` `style(media): rustfmt LimitCPU test imports`; `792397cbdebf8e112c839ea3d16e37a427009752` `test(media): split LimitCPU derived-property assert`. Untracked persist-of-persist files (`sdd/reviews/20261124-sol-pr365-*.md`, `sdd/reviews/20261124-sol-pr373-*.md`, `sdd/reviews/20261125-sol-pr376-*.md`, `sdd/reviews/20261125-sol-pr378-*.md`, `sdd/reviews/20261125-sol-pr380-*.md`, `sdd/reviews/20261125-sol-pr382-*.md`, `sdd/reviews/20261125-sol-pr384-*.md`) are outside this three-dot diff and are not part of this review.
- Verify on this head: run `45569539383` (`pull_request`, name `Verify`, status `completed`, conclusion `success`, `headSha` `792397cbdebf8e112c839ea3d16e37a427009752`). 7/7 success. None cancelled. Billing was not an exception on this run. `gh pr checks 385` reports the same seven jobs `pass`.
- Earlier Verify runs on this branch are not this head and are not counted as the exact-head run. `45565387818` is `pull_request` conclusion `failure` on `9cc757bb1a1b0478aa0f13e3900d5adab7c4d95a`; its `media-broker` job failed rustfmt (`Diff in .../dbus.rs:337`). `45567582042` is `pull_request` conclusion `failure` on `905ba297c834b0c0fe3f4307325f9d7814084a42`; its `media-broker` job failed `clippy::too_many_lines` (`101/100`) on `derived_worker_oom_kills_the_cgroup` at `src/dbus.rs:501`. Those runs are not `792397cb`.
- local cargo: not run. This host is Windows. The new PID 1 test is `#[ignore]` and runs in `media-broker-pid1`. Focused validation is hosted Verify `45569539383`. Its log records `dbus::tests::pid1_worker_limit_cpu ... ok` inside `storecore-media-broker` lib unittests (`src/lib.rs`, `running 16 tests`) and `test result: ok. 16 passed; 0 failed; 0 ignored; 0 measured; 63 filtered out`.
- this file is not a GitHub approval and does not mark `003B-4C` closed

## Job conclusions (Verify 45569539383)

Seven jobs, all `completed` / `success` on `792397cbdebf8e112c839ea3d16e37a427009752`. None cancelled:

- repository-hygiene: success (`139052488103`)
- backend: success (`139052573374`)
- media-broker: success (`139052573522`)
- media-broker-pid1: success (`139052573592`)
- frontend: success (`139052573348`)
- productive-routes-real-e2e: success (`139052573387`)
- unified-access-real-e2e: success (`139052573445`)

`media-broker-pid1` `139052573592` is the job that executed `pid1_worker_limit_cpu`. The media-broker lib unittests finished `16 passed; 0 failed`. The integration-test result lines in that step are `0 passed` (`protocol_vectors`, `snapshot`, `transport`). `media-broker` `139052573522` passed format, lints, and Linux tests on this SHA, so the rustfmt failure on `9cc757bb` and the `clippy::too_many_lines` failure on `905ba297` are not the state of this head.

## Diff reviewed

`git diff origin/master...HEAD`: 3 files, +104 / −10. Commits on `97257c47ea20523f5f66dbae658bcc0e5a9a09d3`:

- `9cc757bb1a1b0478aa0f13e3900d5adab7c4d95a` `feat(media): attest PID 1 LimitCPU on the worker unit`
- `905ba297c834b0c0fe3f4307325f9d7814084a42` `style(media): rustfmt LimitCPU test imports`
- `792397cbdebf8e112c839ea3d16e37a427009752` `test(media): split LimitCPU derived-property assert`

| File | change |
| --- | --- |
| `backend/media-broker/src/dbus.rs` | `worker_properties` gains internal `LimitCPU` equal to `WORKER_RUNTIME_MAX_USEC / 1_000_000` (`12`). `CPUQuota` stays absent. A dedicated unit test locks that key and the `CPUQuota` absence. Ignored PID 1 test starts the derived worker for job `[0x12; 16]` and reads `LimitCPU` back |
| `sdd/STATUS.md` | implementation banner names derived `LimitCPU=12` as `RLIMIT_CPU` from the `IMAGE_IO_V1` timeout, leaves `CPUQuota` and `RestrictAddressFamilies` out, and leaves `003B-4C` open |
| `sdd/wip/.../4-implementation/progress.md` | same claim; `003B-4C` is not marked |

`plan.md`, `spec.md`, `meta.md`, and ADR-001 are not in the diff. No Kotlin, Angular, workflow, migration, fixture, lockfile, HTTP route, or secret. `CPUQuota` does not appear as a worker property. It appears as a comment, as a negative key assertion, and in the STATUS/progress retreat.

## Why this cut

`003B-4C` in `plan.md` on this SHA is still `[ ]` (line 89): harness Linux real con UID A/UID B, SELF_TEST/NORMALIZE dentro de la unidad, attestación efectiva de cgroup v2/mount/quota, aislamiento entre jobs, fallos y reinicios. ADR-001 still requires, before `Ready`, namespaces, no `AF_INET`/`AF_INET6`, `KillMode=control-group`, `MemorySwapMax=0`, `memory.oom.group`, `TasksMax`, `CPUQuota`, RLIMIT, and SELF_TEST `Matched` inside that unit (lines 58–61). The same ADR still lists CPU, runtime, and RLIMIT as separate attestation items (lines 210–215). This cut is one RLIMIT: `LimitCPU=12`, derived from the `IMAGE_IO_V1` timeout / `RuntimeMaxUSec`. It is not `CPUQuota`. `003B-4B-3` (line 84), `003B-4B-4` (line 87), `MEDIA-NORMALIZE-003B-4`, `MEDIA-NORMALIZE-004`, and `TASK-005` (line 16) stay `[ ]`.

STATUS says this cut does not close `003B-4C`. The harness derives `LimitCPU=12` (`RLIMIT_CPU` of the `IMAGE_IO_V1` timeout) and PID 1 reads that property. `CPUQuota` and `RestrictAddressFamilies` stay out. Socket family, global quota, terminals without ACK, FD/mmap after seal, restart on every durable transition, remaining RLIMIT, and `Ready` stay absent. No HTTP. `003B-4B-3`, `003B-4B-4`, `003B-4C`, `003B-4`, TASK-005, and #7 stay open.

The GitHub title and body match the tree. The body says `LimitCPU=12` is `RLIMIT_CPU` for the `IMAGE_IO_V1` timeout, derived inside `worker_properties`, that the client does not supply it, that this is not `CPUQuota`, that PID 1 reads the effective property, that `CPUQuota` and `RestrictAddressFamilies` stay unset, and that `003B-4C` stays open. The PR test plan leaves Verify, the dual reviews, and the `003B-4C` checkbox unchecked. This review does not check them off.

## Implementation

`WORKER_RUNTIME_MAX_USEC` is `12_000_000`. `WORKER_LIMIT_CPU` is `WORKER_RUNTIME_MAX_USEC / 1_000_000`, which is the integer `12` with no remainder. The constant comment says the client cannot supply it and that the value is `RLIMIT_CPU`, not `CPUQuota`. `LimitCPU` is not a parameter of `worker_properties`. That function is the only worker property bag. `properties(UnitKind::Worker)` is what `start_transient` sends to `StartTransientUnit`. The auxiliary property list in `start` stays empty. The mount bag is unchanged. The worker vector has no `CPUQuota` and no `RestrictAddressFamilies`. `RuntimeMaxUSec` stays `12_000_000` beside the new second-scale ceiling. `TransientUnits::derive` still takes only `JobId`, the jobs root, `Principal`, and `&ApprovedRuntime`. Its contract still says callers cannot supply unit names, `Where`, or `ExecStart`. The client does not supply the CPU-time ceiling.

`derived_worker_limit_cpu_is_rlimit_not_quota` exists because extending `derived_worker_oom_kills_the_cgroup` hit `clippy::too_many_lines` (`101/100`) on `905ba297`. The split test asserts `LimitCPU` is present, asserts `CPUQuota` is absent, and matches the debug form of the value against the decimal form of `WORKER_LIMIT_CPU`. `derived_worker_oom_kills_the_cgroup` still asserts `RestrictAddressFamilies` and `CPUQuota` are absent and still locks `LimitNOFILE`, `LimitNPROC`, `LimitCORE`, `LimitFSIZE`, and `PrivateNetwork`. It does not itself assert `LimitCPU`. `UnitKind`, `UnitState`, and `JobState` stay the closed unit and job types. `LimitCPU` is an internal property integer, not a new string state in a view.

`pid1_worker_limit_cpu` is ignored unless `/proc/1/comm` is `systemd` and euid is 0. It derives job `[0x12; 16]` and principal `2102:2102`, starts the mount, writes the existing `SELF_TEST` `request.bin`, and starts the worker through PID 1. A rejected `StartTransientUnit` fails the harness. `systemctl show -p LimitCPU --value` must equal `12` or start with `12:`. Stop of the worker and the mount accepts `Inactive` or `Failed`. Job `[0x12; 16]` is not reused by another `JobId::create` in this file. The hosted job reached `ok` (`16 passed; 0 failed`).

That property is one RLIMIT (`RLIMIT_CPU`) on the worker service. PID 1 accepted the integer. `LimitNOFILE`, `LimitNPROC`, `LimitCORE`, and `LimitFSIZE` remain the RLIMIT settings already on the unit. `LimitCPU` does not replace them and does not set cgroup `CPUQuota`. `RestrictAddressFamilies` is still unset. `CPUQuota` is still unset.

## Ledger

- `sdd/STATUS.md` banner is `4C RLIMIT CPU del worker`. It says this cut does not close `003B-4C`. It names the PID 1 read of derived `LimitCPU=12`. `CPUQuota` and `RestrictAddressFamilies` stay out. Socket family, global quota, terminals without ACK, FD/mmap after seal, restart on every durable transition, remaining RLIMIT, and `Ready` stay absent. `003B-4B-3`, `003B-4B-4`, `003B-4C`, `003B-4`, TASK-005, and #7 stay open. No media HTTP.
- The master paragraph under that banner still describes merged PR #383. This diff does not rewrite it. Live `origin/master` `97257c47ea20523f5f66dbae658bcc0e5a9a09d3` is the persist of those #383 reviews and is the merge-base of this PR. On that merged tree, `003B-4C` is still unmarked. The implementation banner describes this unmerged candidate.
- `progress.md` records the same `LimitCPU=12` readback and that `003B-4C` is not marked. `CPUQuota` and `RestrictAddressFamilies` stay out. No socket family, global quota, `Ready`, or HTTP.
- `plan.md` is not in the diff. `MEDIA-NORMALIZE-003B-4C` remains `- [ ]` (line 89). `003B-4B-3`, `003B-4B-4`, and `TASK-005` remain `- [ ]`.

## Standards applied

`sdd/reviews/20261125-sol-pr383-architecture.md`: one PID 1 RLIMIT (`LimitFSIZE` = workspace bytes) left `RestrictAddressFamilies` and `CPUQuota` unset, and the checkbox rule keeps `plan.md` `[ ]` until the whole `003B-4C` gate is done. That review carries the same rule from `sdd/reviews/20261125-sol-pr381-architecture.md` (`LimitCORE=0`), `sdd/reviews/20261125-sol-pr379-architecture.md` (`LimitNPROC=64`), and `sdd/reviews/20261124-sol-pr374-architecture.md` (`LimitNOFILE=1024`, `RestrictAddressFamilies` stays out after `ENXIO`). This cut attests one more RLIMIT (`LimitCPU=12`, `RLIMIT_CPU` from the timeout) and still leaves that checkbox open. `sdd/reviews/20261122-sol-pr358-architecture.md`, as applied by the #383 review: one PID 1 boundary does not close `003B-4C`, `Ready`, or HTTP. Closed unit kinds stay `UnitKind` / `UnitState` / `JobState`. Android architecture standards and the Spring/Kotlin backend standards do not apply to the behavior under review: the diff has no ViewModel, UiState, controller, or Kotlin change.

## Findings

No P0. No P1. No P2. No P3.

## Residuals (not findings)

- `003B-4B-3`, `003B-4B-4`, aggregate `003B-4B`, `003B-4C`, `003B-4`, `MEDIA-NORMALIZE-004`, TASK-005, and #7 stay open. No `Ready`, no catalog HTTP, no secrets, no deploy. This review does not check off `003B-4C`, `003B-4B-3`, `003B-4B-4`, Ready, HTTP, or TASK-005.
- `CPUQuota` stays unset. ADR-001 still requires it before `Ready`. `RestrictAddressFamilies` stays unset after `ENXIO`. Socket family stays out. Global quota, terminals without ACK, FD/mmap after seal, restart on every durable transition, and remaining RLIMIT stay open. This diff does not add them.
- `LimitCPU` is one RLIMIT (`RLIMIT_CPU`) set to 12 seconds, the same budget as `RuntimeMaxUSec` `12_000_000`. It is not cgroup `CPUQuota` and it is not the full ADR `Ready` RLIMIT list. `LimitNOFILE`, `LimitNPROC`, `LimitCORE`, and `LimitFSIZE` were already attested. Other RLIMIT settings stay unset. One `LimitCPU` does not close `003B-4C`.
- The PID 1 attest reads the unit property with `systemctl show`. It does not read `/proc/<pid>/limits`. `start_transient` returns `Ok(Failed)` when `wait_state` sees `Failed`, and this test only rejects `Err`. A returned `Failed` state is not separately asserted before the property check. ADR-001 still wants the effective unit and the real cgroup files before `Ready`.
- The unit test matches `LimitCPU` by a debug form that contains the decimal form of `WORKER_LIMIT_CPU`. The PID 1 attest accepts that decimal or a value that starts with `<decimal>:`, which also accepts a different hard limit when systemd prints `soft:hard`. The hosted readback matched.
- `derived_worker_oom_kills_the_cgroup` does not assert `LimitCPU`. The split test does. Deleting only the new test would leave the unit suite without a `LimitCPU` assertion. The PID 1 test would still read the property.
- `meta.md` is not in the diff and is not updated to head `792397cb`. The implementation banner and progress carry this cut. That matches the earlier feature cuts, which updated `meta.md` when the reviews were persisted.
- This review file is not a GitHub approval, a merge, or a `Ready` declaration, and it does not mark `003B-4C` closed.

## Conclusion

Head `792397cbdebf8e112c839ea3d16e37a427009752` derives `LimitCPU=12` inside `worker_properties` from `WORKER_RUNTIME_MAX_USEC / 1_000_000`. The client does not supply it. It is `RLIMIT_CPU` from the `IMAGE_IO_V1` timeout, not `CPUQuota`. `CPUQuota` and `RestrictAddressFamilies` stay unset. The PID 1 harness starts the derived worker for job `[0x12; 16]` and reads `LimitCPU` back. That is one RLIMIT, not the ADR `Ready` list. `003B-4C`, `Ready`, HTTP, `003B-4B-3`, `003B-4B-4`, and TASK-005 stay open. Verify `45569539383` is success 7/7 on this SHA, none cancelled, and `media-broker-pid1` `139052573592` passed `pid1_worker_limit_cpu` (`16 passed; 0 failed`). No P0–P3. `APPROVED` for the architecture lane. This file is not a GitHub approval and does not mark `003B-4C` closed.
