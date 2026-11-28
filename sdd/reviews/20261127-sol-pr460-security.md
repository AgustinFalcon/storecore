VERDICT: APPROVED

## Evidence identity

- provider: xAI
- model: grok-4.7-medium-fast
- effort: medium
- lane: security
- authorized substitute after gpt-5.6-sol-medium quota
- independent of the architecture lane (this review did not read `sdd/reviews/20261127-sol-pr460-architecture.md`)
- PR: #460 OPEN, `feat(media): attest PID 1 leaves CPUQuota unset`
- URL: https://github.com/AgustinFalcon/storecore/pull/460
- branch: `feat/media-broker-4c-cpu-quota-unset-20261127`
- base branch: `master`
- base SHA: `68bd125e69e426817eea5c0e936d3a9ccbffabe1`
- head SHA: `cb34813ce124e2f88dcd88ec66e75a0892b07fb3`
- exact range: `68bd125e69e426817eea5c0e936d3a9ccbffabe1...cb34813ce124e2f88dcd88ec66e75a0892b07fb3`
- diff identity: 3 files, 93 insertions, 10 deletions; the full three-dot diff was read
- superseded SHA `1ef42bb63c711e19482ec07afa3a9afcb36a60ae` and Verify `46081952819` were not reviewed
- `git rev-parse HEAD` is `cb34813ce124e2f88dcd88ec66e75a0892b07fb3`
- `git rev-parse origin/master` is `68bd125e69e426817eea5c0e936d3a9ccbffabe1`
- `git rev-parse origin/feat/media-broker-4c-cpu-quota-unset-20261127` is `cb34813ce124e2f88dcd88ec66e75a0892b07fb3`
- `gh pr view 460` reports state OPEN, the same title, and 93/10 counts
- the only commit in the range is `cb34813ce124e2f88dcd88ec66e75a0892b07fb3`
- `git diff --check` on the exact range exited 0 with no output
- the worktree was not checked out, committed, pushed, merged, or retargeted
- this file is not a GitHub approval, does not merge or retarget PR #460, and does not close or check off `003B-4C`, `003B-4B-3`, `003B-4B-4`, Ready, HTTP, or TASK-005

## PR intent and SDD why

`gh pr view 460` describes one cut: attest that PID 1 does not apply `CPUQuota` to the derived worker (`CPUQuotaPerSecUSec` unbounded), with a unit test and a `JobId` `[0x3b; 16]` harness. `LimitCPU` stays the internal RLIMIT. The test plan leaves `MEDIA-NORMALIZE-003B-4C` unchecked. Ready and media HTTP stay out of the cut.

STATUS on this head stays `En implementación`. The banner names the next cut as `Ready`. It records `ProtectHome`, `RestrictAddressFamilies`, and `CPUQuota` as attested absent. It says this document does not close `003B-4C`, that `Ready` is still missing, and that `003B-4B-3`, `003B-4B-4`, `003B-4C`, `003B-4`, TASK-005, and #7 stay open. It says this cut adds no media HTTP. The previous master paragraph still describes PR #458 and still says `CPUQuota` and `Ready` were missing there. It does not claim this PR is merged.

Progress adds `2026-11-27 — arranque 4C CPUQuota ausente` and keeps the earlier RestrictAddressFamilies note. The new note says PID 1 does not apply `CPUQuota`, the harness starts the `.mount` and the worker, reads unbounded `CPUQuotaPerSecUSec`, and stops both units. It says `LimitCPU` remains the internal ceiling. It says `003B-4C` is not marked and that `Ready` and media HTTP remain.

`meta.md` and `plan.md` are outside the diff. On this head, meta still describes the CPUQuota-absent cut as in implementation and says it does not cover `Ready`. It does not check `003B-4C`, `003B-4B-3`, or `003B-4B-4`. `plan.md` still has `- [ ] MEDIA-NORMALIZE-003B-4C` and the same open boxes for `003B-4B-3` and `003B-4B-4`.

ADR-001 still requires `Ready` only when Linux isolation is attested, including `CPUQuota` together with RLIMIT, and it says any failure is `Unavailable`. The effective-attestation rule is unchanged: absence, `Unknown`, a laxer value, or an unreadable value yields `Unavailable`. This diff does not add a cgroup CPU quota and does not return `Ready`. Attesting that `CPUQuota` is unset records the absence ADR-001 still treats as short of `003B-4C`. `LimitCPU` remains `RLIMIT_CPU` and is not that quota.

## Hosted Verify and focused validations

Verify run `46084963002` is a completed `pull_request` run with conclusion `success` on exact head `cb34813ce124e2f88dcd88ec66e75a0892b07fb3`. All 7 jobs succeeded and completed. None were cancelled:

- repository-hygiene `140792280316`
- frontend `140792341719`
- media-broker-pid1 `140792341736`
- unified-access-real-e2e `140792341758`
- productive-routes-real-e2e `140792341798`
- media-broker `140792341825`
- backend `140792341840`

`media-broker` job `140792341825` records `test dbus::tests::derived_worker_cpu_quota ... ok`, `test dbus::tests::pid1_worker_cpu_quota ... ignored`, and `test result: ok. 89 passed; 0 failed; 45 ignored`.

`media-broker-pid1` job `140792341736` runs `cargo +1.100.0 test --locked --all-targets -- --ignored --test-threads=1 pid1_`. It records `test dbus::tests::pid1_worker_cpu_quota ... ok` and `test result: ok. 45 passed; 0 failed; 0 ignored`. The harness that produced that line is the only `JobId::create([0x3b; 16])` in `backend/media-broker/src/dbus.rs`. The log line does not print the property value. The source of the passing test does.

`backend/media-broker/src/lib.rs` is outside the diff. Line 2 is still `#![forbid(unsafe_code)]`.

Name-only diff is only:

- `backend/media-broker/src/dbus.rs`
- `sdd/STATUS.md`
- `sdd/wip/20261116-catalog-media-upload-and-variant-gallery/4-implementation/progress.md`

## Security review

`worker_properties` is unchanged. The derived worker vector still sets `LimitCPU` from `WORKER_LIMIT_CPU` and still sets `PrivateNetwork=true` plus the existing hardening keys. It still has no `CPUQuota`, no `ProtectHome`, and no `RestrictAddressFamilies`. The comment on `WORKER_LIMIT_CPU` still says this is `RLIMIT_CPU`, not `CPUQuota`. The diff adds assertions. It does not insert a CPU percentage, a `CPUQuotaPeriodSec`, or a cgroup `cpu.max`.

`derived_worker_cpu_quota` builds the derived worker and asserts the property keys omit `CPUQuota`, `ProtectHome`, and `RestrictAddressFamilies`, and that `LimitCPU` remains. The existing `derived_worker_limit_cpu_is_rlimit_not_quota` still checks that `LimitCPU` carries the internal 12-second ceiling and that `CPUQuota` is absent. This cut does not replace that RLIMIT with a cgroup quota, and it does not drop the RLIMIT.

`pid1_worker_cpu_quota` is ignored unless the process is root, PID 1 is systemd, and the system bus is available. It uses `JobId::create([0x3b; 16])`, starts the derived `.mount`, writes the self-test request, and starts the worker. A failed `StartTransientUnit` dumps the unit and panics. That failure is not treated as a successful omission. After start, `systemctl show -p CPUQuotaPerSecUSec --value` must be empty, exactly `~`, exactly `infinity`, or `n/a` in any ASCII case. `systemctl_property` panics when `systemctl` cannot be run or exits non-zero, so a failed read is not an empty success. Empty and `~` are the unset renderings used by the sibling omission harnesses. `infinity` is the systemd rendering of an unbounded per-second usec quota. `n/a` is the manager rendering that no finite quota value applies. A finite quota string such as a millisecond or microsecond bound does not match and fails the assertion. The harness then stops the worker and the mount and accepts only `Inactive` or `Failed`.

Leaving `CPUQuota` unset is an attestation of absence. It is not a new sandbox tightening and it does not close `Ready`. ADR-001 still requires a positive CPU control before `003B-4C` can close; `LimitCPU` does not satisfy that control. Host isolation already present on the unit, including `PrivateNetwork=true`, is unchanged. STATUS, progress, meta, and `plan.md` keep the gate open.

The three-file diff adds no secret, credential, HTTP route, capability `Ready`, deploy, tag, or publish behavior. It does not retarget Java and does not change workflow, DDL, or a client-supplied property path.

## Open residuals

- positive `CPUQuota` / cgroup CPU control required by ADR-001 before `003B-4C` can close; this cut attests the property is unset
- `LimitCPU` remains `RLIMIT_CPU` and is not a cgroup `CPUQuota`
- `003B-4B-3`, `003B-4B-4`, `003B-4C`, `003B-4`, TASK-005, and `Ready`
- media HTTP, multipart, provider live, secrets, deploy, tag, and publish

## Findings

P0: none.

P1: none.

P2: none.

P3: none.

## Verdict

APPROVED for exact head `cb34813ce124e2f88dcd88ec66e75a0892b07fb3` over base `68bd125e69e426817eea5c0e936d3a9ccbffabe1`. Verify `46084963002` is independently confirmed final 7/7 on that head. PID 1 recorded `pid1_worker_cpu_quota ... ok` for the harness whose `JobId` is `[0x3b; 16]`. `CPUQuota` stays omitted from the derived worker properties. `LimitCPU` stays. `RestrictAddressFamilies` and `ProtectHome` stay omitted. An empty effective `CPUQuotaPerSecUSec`, the systemd `~` sentinel, `infinity`, or `n/a` is the accepted evidence that PID 1 did not apply a finite CPU quota. This file is not a GitHub approval and does not merge, retarget, or close `003B-4C`, `003B-4B-3`, `003B-4B-4`, Ready, HTTP, or TASK-005.
