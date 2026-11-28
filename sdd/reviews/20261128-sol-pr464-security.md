VERDICT: APPROVED

## Evidence identity

- provider: xAI
- model: grok-4.7-medium-fast
- effort: medium
- lane: security
- authorized substitute after gpt-5.6-sol-medium quota
- independent of the architecture lane (this review did not read `sdd/reviews/20261128-sol-pr464-architecture.md`)
- PR: #464 OPEN, `feat(media): apply CPUQuotaPerSecUSec and RestrictAddressFamilies D-Bus types`
- URL: https://github.com/AgustinFalcon/storecore/pull/464
- branch: `feat/media-broker-4c-dbus-cpu-families-20261128`
- base branch: `master`
- base SHA: `2f407724406ceb29a2d93773e2627e558d5f8b42`
- head SHA: `d1e125015bf34d7a32cb738919aa91ccb2607480`
- exact range: `2f407724406ceb29a2d93773e2627e558d5f8b42...d1e125015bf34d7a32cb738919aa91ccb2607480`
- diff identity: 5 files, 206 insertions, 44 deletions; the full three-dot diff was read
- `git rev-parse HEAD` is `d1e125015bf34d7a32cb738919aa91ccb2607480`
- `git ls-remote origin refs/heads/feat/media-broker-4c-dbus-cpu-families-20261128` is `d1e125015bf34d7a32cb738919aa91ccb2607480`
- `git rev-parse origin/master` and `git ls-remote origin refs/heads/master` are `2f407724406ceb29a2d93773e2627e558d5f8b42`
- `git merge-base origin/master HEAD` is `2f407724406ceb29a2d93773e2627e558d5f8b42`
- `git merge-base --is-ancestor` of the base into the head exited 0
- `gh pr view 464` reports state OPEN, the same title, base, head, and 206/44 counts across 5 files. `merged` is false
- commits in the range, oldest first: `270ba20a25f71d073e8f9be69a56d936ba92c593`, `bea29acb44ef205863f968be34c0a5ac2940ba3f`, then `d1e125015bf34d7a32cb738919aa91ccb2607480`. The reviewed tree is the head
- `git diff --check` on the exact range exited 0 with no output
- `plan.md` blob `b85827c97d36e1539584cac5c620e8e5e91f3af3` and ADR-001 blob `ede6364dd2230533a21c05012cfae0b14d2b8947` are identical on base and head
- the worktree was already on the feature branch and was not checked out, committed, pushed, merged, or retargeted
- this file is not a GitHub approval, does not merge or retarget PR #464, and does not close or check off `003B-4C`, `003B-4B-3`, `003B-4B-4`, Ready, HTTP, or TASK-005
- failed Verify runs `46119039321` and `46121692147` are not pass evidence

## PR intent and SDD why

`gh pr view 464` says ADR-001 still requires live `CPUQuota` and no `AF_INET`/`AF_INET6` before `Ready`. This cut sends systemd D-Bus types instead of the unit-file names: `CPUQuotaPerSecUSec` as `t` with `1_000_000` (100%), and `RestrictAddressFamilies` as `(bas)` `(false, ["AF_INET", "AF_INET6"])`, with `PrivateNetwork=true` kept. The stricter allow-list `(true, ["AF_UNIX"])` is not this cut. PID 1 JobId `[0x3a;16]` attests the address-family property and `[0x3b;16]` attests the quota. `ReadyAttestation` stays `Unavailable | Unknown`. Wire `READY` stays `Unknown`. The body says this cut does not add a `Ready` variant, does not amend ADR-001, and does not close `MEDIA-NORMALIZE-003B-4C`, `003B-4B-3`, `003B-4B-4`, `003B-4`, TASK-005, Ready, or media HTTP. No secrets, deploy, tag, or publish. The GitHub test-plan boxes stay unchecked. The PR is OPEN and not merged.

On head `d1e125015bf34d7a32cb738919aa91ccb2607480`:

- `sdd/STATUS.md` stays `En implementación`. The banner says the next cut is `Ready` (sigue `Unavailable`). Restart after `Allocated`, `InputSealed`, `Starting`, `Running`, `Terminating`, `Terminal`, and `Quarantined`, expected and unexpected Active inventory, mmap, FD, terminals without ACK, global quota, and RLIMIT stay attested. `ProtectHome` stays attested absent. This cut derives `CPUQuotaPerSecUSec=1000000` (`t`, 100%) and `RestrictAddressFamilies=(false, AF_INET/AF_INET6)` (`(bas)`) on `StartTransientUnit`. The banner says this document does not close `003B-4C`, that `Ready` is still missing, and that `003B-4B-3`, `003B-4B-4`, `003B-4C`, `003B-4`, TASK-005, and #7 stay open. It adds no media HTTP.
- WIP `progress.md` adds `arranque 4C tipos D-Bus CPUQuota y RestrictAddressFamilies`. It says `StartTransientUnit` derives those two properties with `PrivateNetwork=true`, that the PID 1 harness must attest them, that existing `SELF_TEST` and `NORMALIZE` keep running in the same unit, and that the cut does not emit `Ready`. It says `003B-4C` is not marked and that `Ready` and media HTTP remain.
- WIP `meta.md` stays `implementation_in_progress`. The edited sentence says the D-Bus type cut derives `CPUQuotaPerSecUSec` (`t`) and `RestrictAddressFamilies` (`(bas)`) deny `AF_INET`/`AF_INET6`, that `ReadyAttestation` stays `Unavailable`, and that it does not close `003B-4C`. `003B-4B-3`, `003B-4B-4`, and `003B-4C` stay open. No live GO for Cloudinary, credentials, HTTP upload, deploy, or external homologation is added.
- `plan.md` is outside the diff. `MEDIA-NORMALIZE-003B-4C`, `003B-4B-3`, `003B-4B-4`, and TASK-005 remain `[ ]`. TASK-005 still closes only after the four sub-cuts, and none of them enable HTTP, live provider, secrets, deploy, or homologation.
- ADR-001 is outside the diff. `Ready` still requires Linux amd64/arm64, cgroup v2, the dedicated user, `NoNewPrivileges`, namespaces, no `AF_INET`/`AF_INET6`, `KillMode=control-group`, `MemorySwapMax=0`, `memory.oom.group`, `TasksMax`, `CPUQuota`, RLIMIT, and SELF_TEST `Matched` inside that unit. Any failure is `Unavailable`. This cut supplies the D-Bus quota and the inet deny-list. It does not add a `Ready` variant and does not satisfy the rest of that paragraph.

## Hosted Verify and focused validations

Verify run `46124265198` is a completed `pull_request` run with conclusion `success` on exact head `d1e125015bf34d7a32cb738919aa91ccb2607480`. `gh run view 46124265198 --json conclusion,headSha,event,status` returns that tuple. The run name is Verify, attempt 1, workflow Verify, display title `feat(media): apply CPUQuotaPerSecUSec and RestrictAddressFamilies D-Bus types`. All 7 jobs concluded `success` and `completed`. None were cancelled:

- repository-hygiene `140915233649`
- backend `140915281039`
- productive-routes-real-e2e `140915281047`
- media-broker-pid1 `140915281050`
- media-broker `140915281056`
- unified-access-real-e2e `140915281057`
- frontend `140915281069`

`media-broker-pid1` includes `Start derived tmpfs and worker units through PID 1`, success. `media-broker` includes format, lints, Linux tests, license check, SBOM, and fail-closed HIGH/CRITICAL broker CVEs, all success. `backend` includes packaged media-worker SELF_TEST and fail-closed HIGH/CRITICAL media-worker CVEs, both success.

Name-only diff is exactly:

- `backend/media-broker/src/dbus.rs`
- `backend/media-broker/src/ready.rs`
- `sdd/STATUS.md`
- `sdd/wip/20261116-catalog-media-upload-and-variant-gallery/4-implementation/progress.md`
- `sdd/wip/20261116-catalog-media-upload-and-variant-gallery/meta.md`

`backend/media-broker/src/lib.rs` is outside the diff. Line 2 is still `#![forbid(unsafe_code)]`. The new `dbus.rs` and `ready.rs` lines contain no `unsafe`.

## Security review

`worker_properties` still builds the unit from internal constants. `CPUQuotaPerSecUSec` is `Value::from(WORKER_CPU_QUOTA_PER_SEC_USEC)` with `WORKER_CPU_QUOTA_PER_SEC_USEC = 1_000_000`. `restrict_address_families` takes no arguments and returns `Value::from((false, vec!["AF_INET".to_owned(), "AF_INET6".to_owned()]))`. The client cannot supply the quota or the family list. The unit-file key `CPUQuota` is still absent. `LimitCPU` remains `WORKER_LIMIT_CPU` (`RLIMIT_CPU`, `WORKER_RUNTIME_MAX_USEC / 1_000_000`) and is a different property from `CPUQuotaPerSecUSec`. `PrivateNetwork` stays `Value::from(true)` immediately before those two properties. `ProtectHome` stays omitted.

`derived_worker_restrict_address_families` asserts signature `(bas)` and that the debug encoding contains `false`, `AF_INET`, and `AF_INET6`. `derived_worker_cpu_quota` asserts signature `t` and that the encoding contains `1000000`. Sibling property tests now require both new keys and still forbid the string key `CPUQuota`.

`ReadyAttestation` remains a closed enum with exactly `Unavailable` and `Unknown`. There is no `Ready` variant, no `Display`/`serde` that could emit `READY`, and no production caller that promotes a capability. `from_wire` accepts only the exact string `UNAVAILABLE`. `READY` is `Unknown`. `from_effective` returns `Unavailable` on both arms, including when `cpu_quota_absent` or `families_unrestricted` is false. `from_effective("1000000", "~AF_INET ~AF_INET6")` is `Unavailable`. `from_effective("100%", "AF_UNIX")` is `Unavailable`. Empty, `~`, `infinity`, and `n/a`/`N/A` CPU readings stay `Unavailable`. A finite quota paired with empty or `~` families stays `Unavailable`. A laxer or unreadable reading cannot be promoted: the function has no success arm. The `ready.rs` change is the module comment. The enum and both translators are unchanged.

PID 1 `pid1_worker_restrict_address_families` (JobId `[0x3a;16]`) panics if `StartTransientUnit` fails, then requires `restrict_address_families_applied` on the live `RestrictAddressFamilies` dump. PID 1 `pid1_worker_cpu_quota` (JobId `[0x3b;16]`) panics if start fails, then requires `cpu_quota_per_sec_applied` on live `CPUQuotaPerSecUSec`. A failed start is not treated as Ready. `pid1_worker_ready_stays_unavailable` (JobId `[0x3c;16]`) still asserts `from_effective` of the live readings is `Unavailable` and wire `READY` is `Unknown`.

`restrict_address_families_applied` accepts the systemd deny-list dump `~AF_INET AF_INET6` and the per-token form `~AF_INET ~AF_INET6`. Empty and `~` return false. An allow-list that includes `AF_INET` or `AF_INET6` returns false. The non-deny branch returns true when every token is some other family, and the unit test pins `AF_UNIX AF_NETLINK` as that case. `cpu_quota_per_sec_applied` accepts `1000000`, `1s`, `1 s`, `1000000us`, and `1,000,000`. It rejects empty, `~`, and `infinity`. Both helpers are `#[cfg(test)]` and do not feed a Ready arm.

The diff adds no secret, credential, HTTP route, capability `Ready`, deploy, tag, or publish step. It does not retarget Java. `plan.md` checkboxes stay `[ ]`. `daemon`, `protocol`, `transport`, workflows, and DDL are outside the range. The extra `eprintln` of the `StartTransientUnit` debug error is a unit-start failure log, not a credential.

## Open residuals

- `Ready` is still not a variant; `003B-4B-3`, `003B-4B-4`, `003B-4C`, `003B-4`, TASK-005, and #7 stay open
- ADR-001 `Ready` still requires the rest of the sandbox paragraph; a finite `CPUQuotaPerSecUSec` plus an inet deny-list evaluates to `Unavailable`
- the stricter allow-list `(true, ["AF_UNIX"])` is not this cut; families other than `AF_INET`/`AF_INET6` stay permitted beside `PrivateNetwork=true`
- `LimitCPU` remains `RLIMIT_CPU` and is distinct from `CPUQuotaPerSecUSec`; the unit-file string `CPUQuota` stays unset
- `ProtectHome` stays absent
- the test-only non-deny matcher also accepts a token set that simply omits `AF_INET`/`AF_INET6`; that helper cannot change `ReadyAttestation`
- media HTTP, multipart, provider live, secrets, deploy, tag, and publish

## Findings

P0: none.

P1: none.

P2: none.

P3: none.

## Verdict

APPROVED for exact head `d1e125015bf34d7a32cb738919aa91ccb2607480` over base `2f407724406ceb29a2d93773e2627e558d5f8b42`. Verify `46124265198` is 7/7 on that head, including `media-broker-pid1` `140915281050`. The range is `dbus.rs`, `ready.rs`, `STATUS.md`, `progress.md`, and `meta.md`: 206 insertions and 44 deletions. `CPUQuotaPerSecUSec` is internal `t` `1_000_000`. `RestrictAddressFamilies` is internal `(bas)` deny `AF_INET`/`AF_INET6`. `PrivateNetwork=true` stays. `LimitCPU` stays `RLIMIT_CPU`. `ReadyAttestation` has no `Ready` variant. `from_wire("READY")` is `Unknown`. `from_effective` stays `Unavailable` for the applied readings and for absent readings. `lib.rs` still has `#![forbid(unsafe_code)]`. Failed runs `46119039321` and `46121692147` are not evidence. This file is not a GitHub approval and does not merge, retarget, or close `003B-4C`, `003B-4B-3`, `003B-4B-4`, Ready, HTTP, or TASK-005.
