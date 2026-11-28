VERDICT: APPROVED

## Evidence identity

- provider: xAI
- model: grok-4.7-medium-fast
- effort: medium
- lane: security
- authorized substitute after gpt-5.6-sol-medium quota
- independent of the architecture lane (this review did not read `sdd/reviews/20261127-sol-pr462-architecture.md`)
- PR: #462 OPEN, `feat(media): attest PID 1 Ready stays Unavailable`
- URL: https://github.com/AgustinFalcon/storecore/pull/462
- branch: `feat/media-broker-4c-ready-unavailable-20261127`
- base branch: `master`
- base SHA: `79e6b76c88ec3f1636fb5ddab2ddc526f36b4c78`
- head SHA: `afaf15dc24c4c1532fb69c9e91ed2f12c6fb4eeb`
- exact range: `79e6b76c88ec3f1636fb5ddab2ddc526f36b4c78...afaf15dc24c4c1532fb69c9e91ed2f12c6fb4eeb`
- diff identity: 6 files, 188 insertions, 2 deletions; the full three-dot diff was read
- `git rev-parse HEAD` is `afaf15dc24c4c1532fb69c9e91ed2f12c6fb4eeb`
- `git ls-remote origin refs/heads/feat/media-broker-4c-ready-unavailable-20261127` is `afaf15dc24c4c1532fb69c9e91ed2f12c6fb4eeb`
- `git rev-parse origin/master` and `git ls-remote origin refs/heads/master` are `79e6b76c88ec3f1636fb5ddab2ddc526f36b4c78`
- `gh pr view 462` reports state OPEN, the same title, base, head, and 188/2 counts
- commits in the range, oldest first: `36e64e04af02bf374a666b190127ddbb4d4e65c0` then `afaf15dc24c4c1532fb69c9e91ed2f12c6fb4eeb`. The reviewed tree is the head. This review does not use superseded SHA `36e64e04af02bf374a666b190127ddbb4d4e65c0` or failed Verify `46091494092` as evidence
- `git diff --check` on the exact range exited 0 with no output
- `git merge-base --is-ancestor` of the base into the head exited 0
- the worktree was not checked out, committed, pushed, merged, or retargeted
- this file is not a GitHub approval, does not merge or retarget PR #462, and does not close or check off `003B-4C`, `003B-4B-3`, `003B-4B-4`, Ready, HTTP, or TASK-005

## PR intent and SDD why

`gh pr view 462` describes a closed `ReadyAttestation` of `Unavailable | Unknown`, with wire `READY` mapped to `Unknown`. PID 1 JobId `[0x3c;16]` evaluates live `CPUQuotaPerSecUSec` and `RestrictAddressFamilies` and the result stays `Unavailable`. The body says documentation is only SDD pointers, `MEDIA-NORMALIZE-003B-4C` stays open, and this cut does not return `Ready` or add media HTTP. The GitHub test-plan boxes stay unchecked. The PR is OPEN and not merged.

On head `afaf15dc24c4c1532fb69c9e91ed2f12c6fb4eeb`:

- `sdd/STATUS.md` stays `En implementación`. The banner now says the next cut is `Ready` (sigue `Unavailable`). Restart after `Allocated`, `InputSealed`, `Starting`, `Running`, `Terminating`, `Terminal`, and `Quarantined`, expected and unexpected Active inventory, mmap, FD, terminals without ACK, global quota, and RLIMIT stay attested. `ProtectHome`, `RestrictAddressFamilies`, and `CPUQuota` stay attested absent. The banner says this document does not close `003B-4C`, that `Ready` is still missing, and that `003B-4B-3`, `003B-4B-4`, `003B-4C`, `003B-4`, TASK-005, and #7 stay open. It adds no media HTTP.
- WIP `progress.md` adds `arranque 4C Ready sigue Unavailable`. It says the PID 1 harness starts `.mount` and the worker, reads effective `CPUQuotaPerSecUSec` and `RestrictAddressFamilies`, evaluates `ReadyAttestation`, and the result is `Unavailable`. Wire `READY` is `Unknown`. It says `003B-4C` is not marked and that `Ready` and media HTTP remain. The earlier `CPUQuota` absence note stays above it and still says `LimitCPU` is the internal ceiling.
- WIP `meta.md` stays `implementation_in_progress`. The edited sentence says the `Ready` cut stays `Unavailable` and does not close `003B-4C`. `003B-4B-3`, `003B-4B-4`, and `003B-4C` stay open. No live GO for Cloudinary, credentials, HTTP upload, deploy, or external homologation is added.
- `plan.md` is outside the diff. Its blob is `b85827c97d36e1539584cac5c620e8e5e91f3af3` on both base and head. `MEDIA-NORMALIZE-003B-4C`, `003B-4B-3`, `003B-4B-4`, and TASK-005 remain `[ ]`. TASK-005 still closes only after the four sub-cuts, and none of them enable HTTP, live provider, secrets, deploy, or homologation.
- ADR-001 is outside the diff. Its blob is `ede6364dd2230533a21c05012cfae0b14d2b8947` on both base and head. `Ready` still requires Linux amd64/arm64, cgroup v2, the dedicated user, `NoNewPrivileges`, namespaces, no `AF_INET`/`AF_INET6`, `KillMode=control-group`, `MemorySwapMax=0`, `memory.oom.group`, `TasksMax`, `CPUQuota`, RLIMIT, and SELF_TEST `Matched` inside that unit. Any failure is `Unavailable`. This cut does not supply the positive `CPUQuota` or socket-family restriction ADR-001 requires before `Ready`.

## Hosted Verify and focused validations

Verify run `46094600247` is a completed `pull_request` run with conclusion `success` on exact head `afaf15dc24c4c1532fb69c9e91ed2f12c6fb4eeb`. `gh run view 46094600247 --json conclusion,headSha,event,status` returns that tuple. The run name is Verify, attempt 1, workflow `.github/workflows/verify.yml`, display title `feat(media): attest PID 1 Ready stays Unavailable`, base `master` at `79e6b76c88ec3f1636fb5ddab2ddc526f36b4c78`. All 7 jobs concluded `success` and `completed`. None were cancelled:

- repository-hygiene `140822968961`
- productive-routes-real-e2e `140823024451`
- media-broker `140823024455`
- media-broker-pid1 `140823024459`
- frontend `140823024487`
- backend `140823024488`
- unified-access-real-e2e `140823024495`

`media-broker` includes format, lints, Linux tests, license check, SBOM, and fail-closed HIGH/CRITICAL broker CVEs, all success. `media-broker-pid1` includes `Start derived tmpfs and worker units through PID 1`, success. `backend` includes packaged media-worker SELF_TEST and fail-closed HIGH/CRITICAL media-worker CVEs, both success.

Name-only diff is exactly:

- `backend/media-broker/src/dbus.rs`
- `backend/media-broker/src/lib.rs`
- `backend/media-broker/src/ready.rs`
- `sdd/STATUS.md`
- `sdd/wip/20261116-catalog-media-upload-and-variant-gallery/4-implementation/progress.md`
- `sdd/wip/20261116-catalog-media-upload-and-variant-gallery/meta.md`

`backend/media-broker/src/lib.rs` adds `pub mod ready` and nothing else. Line 2 is still `#![forbid(unsafe_code)]`. `ready.rs` contains no `unsafe`.

## Security review

`ReadyAttestation` is a closed enum with exactly `Unavailable` and `Unknown`. There is no `Ready` variant, no `Display`/`serde` that could emit `READY`, and no production caller outside the new module and the two new `dbus` tests. `daemon`, `protocol`, `transport`, workflows, and DDL are outside the range.

`from_wire` accepts only the exact string `UNAVAILABLE`. `READY`, `ready`, `unknown`, and every other string are `Unknown`. `Unknown` is not `Ready`. The unit test and both new harness tests assert `from_wire("READY") == Unknown`.

`from_effective` returns `Unavailable` on both arms, including when `cpu_quota_absent` or `families_unrestricted` is false. `from_effective("100%", "AF_UNIX")` is `Unavailable`. Empty, `~`, `infinity`, and `n/a`/`N/A` CPU readings paired with `AF_UNIX` are `Unavailable`. A `100%` CPU reading paired with empty or `~` address families is `Unavailable`. A laxer or unreadable reading cannot be promoted: the function has no success arm. `LimitCPU` is untouched and the comment on `WORKER_LIMIT_CPU` still says it is `RLIMIT_CPU`, not `CPUQuota`.

`worker_properties` is unchanged by this range. It still sets `LimitCPU` and `PrivateNetwork=true` and still does not emit `CPUQuota`, `CPUQuotaPeriodSec`, or `RestrictAddressFamilies`. The new non-PID-1 test `derived_worker_ready_stays_unavailable` asserts those two keys are absent and that `from_effective("", "")` is `Unavailable`. The pre-existing PID 1 tests `pid1_worker_cpu_quota` (JobId `[0x3b;16]`) and `pid1_worker_restrict_address_families` (JobId `[0x3a;16]`) still require the live readings to be the absent sentinels. This diff does not weaken them.

`pid1_worker_ready_stays_unavailable` is ignored unless the host is root, PID 1 is systemd, and the system bus is available. JobId is `[0x3c;16]`, distinct from the sibling harness ids. It starts the mount, requires `Active`, starts the worker, and panics if `StartTransientUnit` fails. It then reads live `CPUQuotaPerSecUSec` and `RestrictAddressFamilies` and asserts `from_effective` of those readings is `Unavailable`. It also asserts wire `READY` is `Unknown`, then stops the worker and the mount. A failed start is not treated as Ready. Because both arms of `from_effective` are `Unavailable`, a finite quota plus `AF_UNIX` on that live unit still cannot be reported as Ready.

The diff adds no secret, credential, HTTP route, capability `Ready`, deploy, tag, or publish step. It does not retarget Java and does not change a client-supplied property path. `plan.md` checkboxes stay `[ ]`.

## Open residuals

- positive `CPUQuota` / cgroup CPU control required by ADR-001 before `003B-4C` can close; `CPUQuota` stays unset and `LimitCPU` remains `RLIMIT_CPU`
- `RestrictAddressFamilies` stays omitted; absence is not an `AF_UNIX`-only allowlist and is not `Ready`
- `Ready` is still not a variant; `003B-4B-3`, `003B-4B-4`, `003B-4C`, `003B-4`, TASK-005, and #7 stay open
- media HTTP, multipart, provider live, secrets, deploy, tag, and publish

## Findings

P0: none.

P1: none.

P2: none.

P3: none.

## Verdict

APPROVED for exact head `afaf15dc24c4c1532fb69c9e91ed2f12c6fb4eeb` over base `79e6b76c88ec3f1636fb5ddab2ddc526f36b4c78`. Verify `46094600247` is 7/7 on that head. The range is `dbus.rs`, `lib.rs`, `ready.rs`, `STATUS.md`, `progress.md`, and `meta.md`: 188 insertions and 2 deletions. `ReadyAttestation` has no `Ready` variant. `from_wire("READY")` is `Unknown`. `from_effective` stays `Unavailable` for absent readings and for `100%` plus `AF_UNIX`. PID 1 JobId `[0x3c;16]` asserts `Unavailable` on live `CPUQuotaPerSecUSec` and `RestrictAddressFamilies`. `lib.rs` still has `#![forbid(unsafe_code)]`. This file is not a GitHub approval and does not merge, retarget, or close `003B-4C`, `003B-4B-3`, `003B-4B-4`, Ready, HTTP, or TASK-005.
