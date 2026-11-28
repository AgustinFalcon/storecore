VERDICT: APPROVED

## Evidence identity

- provider: xAI
- model: grok-4.7-medium-fast
- effort: medium
- lane: architecture
- authorized substitute after gpt-5.6-sol-medium quota
- independent of the security lane (this review did not read `sdd/reviews/20261127-sol-pr460-security.md`)
- PR: #460 OPEN, `feat(media): attest PID 1 leaves CPUQuota unset`
- URL: https://github.com/AgustinFalcon/storecore/pull/460
- branch: `feat/media-broker-4c-cpu-quota-unset-20261127`
- base branch: `master`
- base SHA: `68bd125e69e426817eea5c0e936d3a9ccbffabe1`
- head SHA: `cb34813ce124e2f88dcd88ec66e75a0892b07fb3`
- exact range: `68bd125e69e426817eea5c0e936d3a9ccbffabe1...cb34813ce124e2f88dcd88ec66e75a0892b07fb3`
- diff identity: 3 files, 93 insertions, 10 deletions; the full three-dot diff was read
- `git diff --check` on that range exited 0 with no output
- `git rev-parse HEAD` and `git rev-parse origin/feat/media-broker-4c-cpu-quota-unset-20261127` are `cb34813ce124e2f88dcd88ec66e75a0892b07fb3`
- `git rev-parse origin/master` is `68bd125e69e426817eea5c0e936d3a9ccbffabe1`. `git merge-base origin/master origin/feat/media-broker-4c-cpu-quota-unset-20261127` is the same SHA
- superseded SHA `1ef42bb63c711e19482ec07afa3a9afcb36a60ae` and Verify `46081952819` were not reviewed
- no checkout, commit, push, or merge was performed. The worktree was left on `feat/media-broker-4c-cpu-quota-unset-20261127`
- this file is not a GitHub approval, does not merge or retarget, and does not close or check off `003B-4C`, `003B-4B-3`, `003B-4B-4`, Ready, HTTP, or TASK-005

## PR intent and SDD why

`gh pr view 460` reports the expected OPEN implementation PR. Head `cb34813ce124e2f88dcd88ec66e75a0892b07fb3`, base `68bd125e69e426817eea5c0e936d3a9ccbffabe1`, state open, 3 files, 93 additions, 10 deletions. The body attests that PID 1 does not apply `CPUQuota` to the derived worker (`CPUQuotaPerSecUSec` unbounded), that `LimitCPU` stays the internal RLIMIT, and that the evidence is the unit test plus the JobId `[0x3b;16]` harness. Ready and HTTP stay out. `003B-4C` stays open. The GitHub test-plan boxes remain unchecked.

On this head:

- `sdd/STATUS.md` stays `En implementación`. The banner names the next cut as `Ready`. Restart after `Allocated`, `InputSealed`, `Starting`, `Running`, `Terminating`, `Terminal`, and `Quarantined`, expected and unexpected Active inventory, mmap, FD, terminals without ACK, global quota, and RLIMIT stay attested. `ProtectHome`, `RestrictAddressFamilies`, and `CPUQuota` are attested absent. The banner does not close `003B-4C`. It still lacks `Ready`. `003B-4B-3`, `003B-4B-4`, `003B-4C`, `003B-4`, TASK-005, and #7 stay open. This cut adds no media HTTP. The master section for PR #458 is unchanged and still records that merged cut as missing `CPUQuota` and `Ready`. This range does not rewrite that historical master section into a merge of #460.
- WIP `progress.md` adds `arranque 4C CPUQuota ausente` at the top. PID 1 does not apply `CPUQuota` to the derived worker. The harness starts `.mount` and the worker, reads unbounded `CPUQuotaPerSecUSec`, and stops both units. `LimitCPU` remains the internal ceiling. It does not mark `003B-4C`. `Ready` and media HTTP remain missing. The previous `RestrictAddressFamilies` arranque is kept under the PR #458 persist section. That persist bullet still says `CPUQuota` was missing at the #458 merge. That sentence is the historical record of #458, under its own heading.
- WIP `meta.md` is outside the diff. It stays `implementation_in_progress`. It still says the `CPUQuota` absence cut is in implementation and does not cover `Ready`. That matches an open PR. `003B-4B-3`, `003B-4B-4`, and `003B-4C` remain open.
- `plan.md` is outside the diff. `MEDIA-NORMALIZE-003B-4C` remains `[ ]`, as do `003B-4B-3`, `003B-4B-4`, `MEDIA-NORMALIZE-003B-4`, and TASK-005. TASK-005 still closes only after the four sub-cuts, and none of them enable HTTP.
- ADR-001 is outside the diff. `Ready` still requires Linux amd64/arm64, cgroup v2, the dedicated user, `NoNewPrivileges`, namespaces, no `AF_INET`/`AF_INET6`, `KillMode=control-group`, `MemorySwapMax=0`, `memory.oom.group`, `TasksMax`, `CPUQuota`, RLIMIT, and SELF_TEST `Matched` inside that unit. Effective attestation must read the live unit and the real cgroup, including CPU. Absence, `Unknown`, a looser value, or an unreadable property produces `Unavailable`. This cut records that `CPUQuota` is absent. It does not supply the positive quota ADR-001 requires before `Ready`.

## Hosted Verify and focused validations

Verify run `46084963002` is a completed `pull_request` run with conclusion `success` on exact head `cb34813ce124e2f88dcd88ec66e75a0892b07fb3`. `gh run view 46084963002 --json conclusion,headSha,event,status` returns that identity. All 7 jobs concluded `success` and `completed`. None were cancelled:

- repository-hygiene `140792280316`
- frontend `140792341719`
- media-broker-pid1 `140792341736`
- unified-access-real-e2e `140792341758`
- productive-routes-real-e2e `140792341798`
- media-broker `140792341825`
- backend `140792341840`

Name-only diff is exactly:

- `backend/media-broker/src/dbus.rs`
- `sdd/STATUS.md`
- `sdd/wip/20261116-catalog-media-upload-and-variant-gallery/4-implementation/progress.md`

`backend/media-broker/src/lib.rs` is absent from the range. On this head it still begins with `#![cfg(target_os = "linux")]` and `#![forbid(unsafe_code)]`.

`worker_properties` is unchanged. It still emits `LimitCPU` from `WORKER_LIMIT_CPU` (`WORKER_RUNTIME_MAX_USEC / 1_000_000`, the 12-second `RLIMIT_CPU` ceiling documented as `RLIMIT_CPU`, not `CPUQuota`). The property vector has no `CPUQuota` key. No broker, runtime, reconcile, protocol, or HTTP file changes.

`derived_worker_cpu_quota` derives a worker for JobId `[0xab;16]` and asserts the `CPUQuota` key is absent, `LimitCPU` is present, and `ProtectHome` and `RestrictAddressFamilies` are absent. The pre-existing `derived_worker_limit_cpu_is_rlimit_not_quota` still checks that `LimitCPU` carries the internal 12-second ceiling and that `CPUQuota` is absent. The `media-broker` job runs unfiltered `cargo +1.100.0 test --locked --all-targets`, so this non-ignored unit test is in the successful job.

`pid1_worker_cpu_quota` is `#[ignore]` with the existing PID 1 gate. It uses JobId `[0x3b;16]`, distinct from `pid1_worker_restrict_address_families` (`[0x3a;16]`). It starts the derived `.mount` and worker through `ZbusSystemd`, reads `CPUQuotaPerSecUSec` with `systemctl show -p CPUQuotaPerSecUSec --value`, and accepts only empty, `~`, `infinity`, or `n/a` (ASCII case-insensitive). Any other reading, including a finite microsecond quota, fails the assertion. It then stops the worker and the mount and accepts `Inactive` or `Failed`. The `media-broker-pid1` job invokes `cargo +1.100.0 test --locked --all-targets -- --ignored --test-threads=1 pid1_`. Its log records `test dbus::tests::pid1_worker_cpu_quota ... ok` and `test result: ok. 45 passed; 0 failed; 0 ignored`.

## Architecture review

- The range adds attestation only. `TransientUnits::derive` and `worker_properties` do not gain a `CPUQuota` assignment, a `CPUAccounting` flag, or a cgroup `cpu.max` write. `LimitCPU` stays the process RLIMIT. It is not a cgroup CPU quota, and this cut does not treat the 12-second ceiling as one.
- The unit test locks the request side: the derived property list omits `CPUQuota` and still carries `LimitCPU`, and it keeps the already attested absences of `ProtectHome` and `RestrictAddressFamilies`. The PID 1 test locks the effective side: `CPUQuotaPerSecUSec` must be an unbounded sentinel. `infinity` is the systemd default for an unset usec quota. Empty and `~` are the unset sentinels already accepted for string properties. `n/a` is an unread or inapplicable reading. None of those four is a finite quota, and a finite value fails the test. ADR-001 maps absence and an unreadable property to `Unavailable`, so this observation cannot produce `Ready`.
- The harness does not read the cgroup v2 CPU file. ADR-001 still requires that reading, together with a positive `CPUQuota`, before `Ready`. STATUS and progress leave that gate open and name `Ready` as the next cut. The historical #458 master section and the #458 persist bullet still say `CPUQuota` was missing at that merge. They do not claim this open PR has landed on `master`.
- No checkbox moves to `[x]`. `003B-4B-3`, `003B-4B-4`, `003B-4C`, `003B-4`, TASK-005, Ready, and media HTTP stay open. The range adds no secret, tag, deploy, or publish step.
- The GitHub body test-plan boxes remain unchecked. Hosted Verify `46084963002` is the evidence for this head.

## P0–P3

- P0: none
- P1: none
- P2: none
- P3: none

## Conclusion

The exact range attests that the derived worker does not request `CPUQuota` and that PID 1's `CPUQuotaPerSecUSec` stays unbounded (empty, `~`, `infinity`, or `n/a`). `LimitCPU` remains the internal `RLIMIT_CPU`. Verify `46084963002` is 7/7 on `cb34813ce124e2f88dcd88ec66e75a0892b07fb3`, including `pid1_worker_cpu_quota` ok. `lib.rs` is unchanged and still `#![forbid(unsafe_code)]`. `003B-4C`, `003B-4B-3`, `003B-4B-4`, Ready, HTTP, and TASK-005 stay open. Architecture verdict: APPROVED with no P0–P3. This file is not a GitHub approval and does not merge, retarget, or close those gates.
