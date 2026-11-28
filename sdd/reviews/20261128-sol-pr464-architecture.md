VERDICT: APPROVED

## Evidence identity

- provider: xAI
- model: grok-4.7-medium-fast
- effort: medium
- lane: architecture
- authorized substitute after gpt-5.6-sol-medium quota
- independent of the security lane (this review did not read `sdd/reviews/20261128-sol-pr464-security.md`)
- PR: #464 OPEN, `feat(media): apply CPUQuotaPerSecUSec and RestrictAddressFamilies D-Bus types`
- URL: https://github.com/AgustinFalcon/storecore/pull/464
- branch: `feat/media-broker-4c-dbus-cpu-families-20261128`
- base branch: `master`
- base SHA: `2f407724406ceb29a2d93773e2627e558d5f8b42`
- head SHA: `d1e125015bf34d7a32cb738919aa91ccb2607480`
- exact range: `2f407724406ceb29a2d93773e2627e558d5f8b42...d1e125015bf34d7a32cb738919aa91ccb2607480`
- diff identity: 5 files, 206 insertions, 44 deletions; the full three-dot diff was read
- reviewed head is `d1e125015bf34d7a32cb738919aa91ccb2607480` and Verify `46124265198` only. Failed Verify runs `46119039321` and `46121692147` were not treated as pass evidence
- `git diff --check` on that range exited 0 with no output
- `git rev-parse HEAD` is `d1e125015bf34d7a32cb738919aa91ccb2607480`
- `git ls-remote origin refs/heads/feat/media-broker-4c-dbus-cpu-families-20261128` is `d1e125015bf34d7a32cb738919aa91ccb2607480`
- `git rev-parse origin/master` is `2f407724406ceb29a2d93773e2627e558d5f8b42`. `git merge-base origin/master HEAD` is the same SHA. `git ls-remote origin refs/heads/master` is the same SHA
- `gh pr view 464` reports state OPEN, head `d1e125015bf34d7a32cb738919aa91ccb2607480`, base `2f407724406ceb29a2d93773e2627e558d5f8b42`, 5 files, 206 additions, 44 deletions
- no checkout, commit, push, or merge was performed. The worktree was already on `feat/media-broker-4c-dbus-cpu-families-20261128` and was left there
- this review is not a GitHub approval, does not merge or retarget, and does not close or check off `003B-4C`, `003B-4B-3`, `003B-4B-4`, Ready, HTTP, or TASK-005

## PR intent and SDD why

`gh pr view 464` reports the expected OPEN implementation PR. The body applies systemd D-Bus encodings instead of amending ADR-001: `CPUQuotaPerSecUSec` type `t` at `1_000_000` microseconds/second (100%), and `RestrictAddressFamilies` type `(bas)` as `(false, ["AF_INET", "AF_INET6"])` with `PrivateNetwork=true` kept. It does not send the unit-file string `CPUQuota` or an `as` array, and it does not use the stricter allow-list `(true, ["AF_UNIX"])`. PID 1 JobId `[0x3a;16]` attests the address-family property is applied; `[0x3b;16]` attests `CPUQuotaPerSecUSec=1000000` or systemd's `1s` timespan. Existing `SELF_TEST` `[0x22;16]` and `NORMALIZE` `[0x33;16]` stay in the same unit. `ReadyAttestation` stays `Unavailable` | `Unknown`. Wire `READY` stays `Unknown`. The body states this cut does not add a `Ready` variant and does not close `MEDIA-NORMALIZE-003B-4C`, `003B-4B-3`, `003B-4B-4`, `003B-4`, TASK-005, Ready, or media HTTP. The GitHub test-plan boxes remain unchecked.

On head `d1e125015bf34d7a32cb738919aa91ccb2607480`:

- `sdd/STATUS.md` stays `En implementación`. The banner date moves to 2026-11-28 and still says `4C sigue abierto`. Restart after `Allocated`, `InputSealed`, `Starting`, `Running`, `Terminating`, `Terminal`, and `Quarantined`, expected and unexpected Active inventory, mmap, FD, terminals without ACK, global quota, and RLIMIT stay attested. `ProtectHome` stays attested absent. The next-cut sentence still says `Ready` (sigue `Unavailable`). The same banner now says this cut derives `CPUQuotaPerSecUSec=1000000` (`t`, 100%) and `RestrictAddressFamilies=(false, AF_INET/AF_INET6)` (`(bas)`) on `StartTransientUnit`. It does not close `003B-4C`, still lacks `Ready`, and leaves `003B-4B-3`, `003B-4B-4`, `003B-4C`, `003B-4`, TASK-005, and #7 open, with no media HTTP. The range does not add a master-vigente section for #464.
- WIP `progress.md` adds `arranque 4C tipos D-Bus CPUQuota y RestrictAddressFamilies`. `StartTransientUnit` derives `CPUQuotaPerSecUSec=1000000` (`t`) and `RestrictAddressFamilies=(false, ["AF_INET", "AF_INET6"])` (`(bas)`) with `PrivateNetwork=true`. It does not use the string `CPUQuota` or `as`. The entry says the PID 1 harness must attest those effective properties, that existing `SELF_TEST` and `NORMALIZE` keep running in the same unit, and that the cut does not emit `Ready`. It does not mark `003B-4C`. It still names `Ready` and media HTTP as missing.
- WIP `meta.md` stays `implementation_in_progress`. After the merged #462 `ReadyAttestation::Unavailable` record, the handoff sentence now says the D-Bus type cut derives `CPUQuotaPerSecUSec` (`t`) and `RestrictAddressFamilies` (`(bas)`) deny `AF_INET`/`AF_INET6`, that `ReadyAttestation` stays `Unavailable`, and that it does not close `003B-4C`. It does not record a merge SHA for #464. `003B-4B-3`, `003B-4B-4`, `003B-4C`, and aggregate `003B-4B` remain open. HTTP stays behind those gates.
- `plan.md` is outside the diff. `MEDIA-NORMALIZE-003B-4`, `003B-4B-3`, `003B-4B-4`, `MEDIA-NORMALIZE-003B-4C`, and TASK-005 remain `[ ]`. The aggregate `003B-4` is still the only cut that may return `Ready`. `003B-4C` is still the real Linux harness (distinct principals, effective limits, SELF_TEST/NORMALIZE, termination, cleanup, and recovery). TASK-005 still closes only after the four sub-cuts, and none of them enable HTTP.
- ADR-001 is outside the diff. `Ready` still requires Linux amd64/arm64, cgroup v2, the dedicated user, `NoNewPrivileges`, namespaces, no `AF_INET`/`AF_INET6`, `KillMode=control-group`, `MemorySwapMax=0`, `memory.oom.group`, `TasksMax`, `CPUQuota`, RLIMIT, and SELF_TEST `Matched` inside that unit. Effective attestation must read the live unit and the real cgroup v2 files, including CPU. Absence, `Unknown`, a looser value, or an unreadable property produces `Unavailable`. This cut supplies the D-Bus property types ADR already names. It does not add a `Ready` variant, does not amend ADR-001, and does not read the live cgroup v2 CPU file.

## Hosted Verify and focused validations

Verify run `46124265198` is a completed `pull_request` run with conclusion `success` on exact head `d1e125015bf34d7a32cb738919aa91ccb2607480`. `gh run view 46124265198 --json conclusion,headSha,event,status,name` returns that identity. The workflow name is Verify. All 7 jobs concluded `success` and `completed`. None were cancelled:

- repository-hygiene `140915233649`
- backend `140915281039`
- productive-routes-real-e2e `140915281047`
- media-broker-pid1 `140915281050`
- media-broker `140915281056`
- unified-access-real-e2e `140915281057`
- frontend `140915281069`

`media-broker-pid1` includes the step `Start derived tmpfs and worker units through PID 1`, which completed successfully. That job still runs `cargo +1.100.0 test --locked --all-targets -- --ignored --test-threads=1 pid1_`. Failed runs `46119039321` and `46121692147` are not evidence for this head.

Name-only diff is exactly:

- `backend/media-broker/src/dbus.rs`
- `backend/media-broker/src/ready.rs`
- `sdd/STATUS.md`
- `sdd/wip/20261116-catalog-media-upload-and-variant-gallery/4-implementation/progress.md`
- `sdd/wip/20261116-catalog-media-upload-and-variant-gallery/meta.md`

`backend/media-broker/src/lib.rs` is outside the diff. It still begins with `#![cfg(target_os = "linux")]` and `#![forbid(unsafe_code)]`, and still declares `pub mod ready`. Numstat is 180/33 `dbus.rs`, 4/3 `ready.rs`, 8/7 `STATUS.md`, 10/0 `progress.md`, 4/1 `meta.md`.

## Architecture review

- `ReadyAttestation` remains a closed enum with `Unavailable` and `Unknown` only. There is no `Ready` variant, so no caller can construct a successful Ready attestation. `from_wire` still accepts only the exact string `UNAVAILABLE`. `from_wire("READY")` is `Unknown`. The module comment now says a finite `CPUQuotaPerSecUSec` and a deny-list `RestrictAddressFamilies` still evaluate to `Unavailable`. `from_effective` keeps both arms on `Unavailable`, including the unit case `from_effective("100%", "AF_UNIX")` and the derived case `from_effective("1000000", "~AF_INET ~AF_INET6")`. Applying the two properties does not promote the type. The `ready.rs` diff is that comment plus the derived call site in `dbus.rs`; the enum and the wire translator are unchanged.
- `worker_properties` is still the only derived property list. The client still cannot supply method names, unit names, `Where`, or `ExecStart`. The new entries are internal constants: `CPUQuotaPerSecUSec` is `Value::from(1_000_000u64)` and the unit test locks signature `t` and the decimal `1000000`. The unit-file name `CPUQuota` stays absent from the keys. `RestrictAddressFamilies` is `Value::from((false, vec!["AF_INET", "AF_INET6"]))` and the unit test locks signature `(bas)` together with `false`, `AF_INET`, and `AF_INET6`. `PrivateNetwork=true` stays immediately before those properties. `LimitCPU` stays the separate `RLIMIT_CPU` ceiling. `ProtectHome` stays unset.
- PID 1 test `pid1_worker_restrict_address_families` keeps JobId `[0x3a; 16]`. It now panics if `StartTransientUnit` rejects the `(bas)` deny-list, then requires `restrict_address_families_applied` on `systemctl show -p RestrictAddressFamilies --value`. Empty and `~` are rejected. A leading `~` is the deny-list form and must name both `AF_INET` and `AF_INET6` (`~AF_INET ~AF_INET6` and `~AF_INET AF_INET6`). A list without the leading `~` counts as applied only when it contains neither family (`AF_UNIX AF_NETLINK`); `AF_UNIX AF_INET AF_INET6` fails. That second form matches ADR-001's "sin AF_INET/AF_INET6" if systemd prints an allow-list. The value this cut sends is still the deny-list `(false, [AF_INET, AF_INET6])`, not `(true, ["AF_UNIX"])`.
- PID 1 test `pid1_worker_cpu_quota` keeps JobId `[0x3b; 16]`. It now panics if `StartTransientUnit` rejects `CPUQuotaPerSecUSec=1000000` (`t`), then accepts only `1000000`, `1s`, `1 s`, `1000000us`, or `1,000,000`. Empty, `~`, and `infinity` fail. `pid1_worker_ready_stays_unavailable` keeps JobId `[0x3c; 16]`, reads those two live properties, and requires `from_effective` to be `Unavailable` and `from_wire("READY")` to be `Unknown`. Because both evaluator arms are `Unavailable`, `[0x3c;16]` does not itself prove the properties were applied; `[0x3a;16]` and `[0x3b;16]` do that. Together they match the cut: the properties are applied, and Ready is still refused.
- `pid1_starts_worker_self_test_on_derived_tmpfs` (`[0x22; 16]`) and `pid1_starts_worker_normalize_on_derived_tmpfs` (`[0x33; 16]`) are outside the changed hunks. Both still `TransientUnits::derive` and `start_transient` the worker, so they run inside the same property list that now carries `CPUQuotaPerSecUSec` and `RestrictAddressFamilies`. The deny-list leaves `AF_UNIX` and `AF_NETLINK` for HotSpot under `PrivateNetwork=true`. Hosted `media-broker-pid1` success on this head is the evidence those existing jobs still complete with the new properties. `dump_worker_unit` now also prints `RestrictAddressFamilies`, `CPUQuotaPerSecUSec`, `CPUQuota`, `CPUAccounting`, and `PrivateNetwork` when a start fails. The extra `{:?}` eprintln on `StartTransientUnit` stays a diagnostic of the zbus error; the mapped result is still `SystemdError::Unavailable`.
- `ReadyAttestation` is still referenced from `ready.rs` and the dbus tests only. Daemon, protocol, journal, reconcile, and Spring HTTP are outside the diff. No broker state transition becomes Ready. ADR-001's remaining requirements — the live cgroup v2 CPU file, namespaces as a positive Ready reading, and SELF_TEST `Matched` counted as Ready — stay unmet. `Unavailable` here is still the only evaluation result. It does not close `Ready`.
- STATUS, progress, and meta describe the applied D-Bus types and leave `003B-4C` unmarked. No checkbox moves to `[x]`. `003B-4B-3`, `003B-4B-4`, `003B-4C`, `003B-4`, TASK-005, Ready, and media HTTP stay open. The range adds no secret, tag, deploy, or publish step.
- The GitHub body test-plan boxes remain unchecked. Hosted Verify `46124265198` is the evidence for this head. This review does not check off those boxes and does not treat the applied properties as the close of `003B-4C`.

## P0–P3

- P0: none
- P1: none
- P2: none
- P3: none

## Residuals

- `003B-4C` stays open. `003B-4B-3`, `003B-4B-4`, aggregate `003B-4`, TASK-005, Ready, and media HTTP stay open.
- `ReadyAttestation` still has no `Ready` variant. Wire `READY` stays `Unknown`. ADR-001 is not amended. The live cgroup v2 CPU file is still not part of this cut.
- `ProtectHome` stays attested absent.

## Conclusion

The exact range puts `CPUQuotaPerSecUSec` (`t`, `1_000_000`) and `RestrictAddressFamilies` (`(bas)`, deny `AF_INET`/`AF_INET6`) on the derived worker properties, keeps `PrivateNetwork=true`, and does not send the unit-file string `CPUQuota`. PID 1 `[0x3a;16]` and `[0x3b;16]` attest those effective properties. `[0x3c;16]` still evaluates `ReadyAttestation` as `Unavailable`, and wire `READY` stays `Unknown`. `SELF_TEST` `[0x22;16]` and `NORMALIZE` `[0x33;16]` still start through the same `worker_properties` list. `lib.rs` keeps `#![forbid(unsafe_code)]` and `pub mod ready`. Verify `46124265198` is 7/7 on `d1e125015bf34d7a32cb738919aa91ccb2607480`. `003B-4C`, `003B-4B-3`, `003B-4B-4`, Ready, HTTP, and TASK-005 stay open. Architecture verdict: APPROVED with no P0–P3. This file is not a GitHub approval, and does not merge, retarget, or close those gates.
