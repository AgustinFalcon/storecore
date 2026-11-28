VERDICT: APPROVED

## Evidence identity

- provider: xAI
- model: grok-4.7-medium-fast
- effort: medium
- lane: architecture
- authorized substitute after gpt-5.6-sol-medium quota
- independent of the security lane (this review did not read `sdd/reviews/20261127-sol-pr462-security.md`)
- PR: #462 OPEN, `feat(media): attest PID 1 Ready stays Unavailable`
- URL: https://github.com/AgustinFalcon/storecore/pull/462
- branch: `feat/media-broker-4c-ready-unavailable-20261127`
- base branch: `master`
- base SHA: `79e6b76c88ec3f1636fb5ddab2ddc526f36b4c78`
- head SHA: `afaf15dc24c4c1532fb69c9e91ed2f12c6fb4eeb`
- exact range: `79e6b76c88ec3f1636fb5ddab2ddc526f36b4c78...afaf15dc24c4c1532fb69c9e91ed2f12c6fb4eeb`
- diff identity: 6 files, 188 insertions, 2 deletions; the full three-dot diff was read
- reviewed head is `afaf15dc24c4c1532fb69c9e91ed2f12c6fb4eeb` and Verify `46094600247` only. Superseded SHA `36e64e04af02bf374a666b190127ddbb4d4e65c0` and failed Verify `46091494092` were not reviewed
- `git diff --check` on that range exited 0 with no output
- `git rev-parse HEAD` is `afaf15dc24c4c1532fb69c9e91ed2f12c6fb4eeb`
- `git ls-remote origin refs/heads/feat/media-broker-4c-ready-unavailable-20261127` is `afaf15dc24c4c1532fb69c9e91ed2f12c6fb4eeb`
- `git rev-parse origin/master` is `79e6b76c88ec3f1636fb5ddab2ddc526f36b4c78`. `git merge-base origin/master HEAD` is the same SHA. `git ls-remote origin refs/heads/master` is the same SHA
- `gh pr view 462` reports state OPEN, head `afaf15dc24c4c1532fb69c9e91ed2f12c6fb4eeb`, base `79e6b76c88ec3f1636fb5ddab2ddc526f36b4c78`, 6 files, 188 additions, 2 deletions
- no checkout, commit, push, or merge was performed. The worktree was already on `feat/media-broker-4c-ready-unavailable-20261127` and was left there
- this review is not a GitHub approval, does not merge or retarget, and does not close or check off `003B-4C`, `003B-4B-3`, `003B-4B-4`, Ready, HTTP, or TASK-005

## PR intent and SDD why

`gh pr view 462` reports the expected OPEN implementation PR. The body adds a closed `ReadyAttestation` (`Unavailable` | `Unknown`), maps wire `READY` to `Unknown`, and has PID 1 JobId `[0x3c;16]` evaluate live `CPUQuotaPerSecUSec` and `RestrictAddressFamilies` while the result stays `Unavailable`. It states `MEDIA-NORMALIZE-003B-4C` stays open and that this cut does not return `Ready` or add media HTTP. The GitHub test-plan boxes remain unchecked.

On head `afaf15dc24c4c1532fb69c9e91ed2f12c6fb4eeb`:

- `sdd/STATUS.md` stays `En implementación`. The banner now names the next cut as `Ready` (sigue `Unavailable`). Restart after `Allocated`, `InputSealed`, `Starting`, `Running`, `Terminating`, `Terminal`, and `Quarantined`, expected and unexpected Active inventory, mmap, FD, terminals without ACK, global quota, and RLIMIT stay attested. `ProtectHome`, `RestrictAddressFamilies`, and `CPUQuota` stay attested absent. The same banner says this document does not close `003B-4C`, still lacks `Ready`, and leaves `003B-4B-3`, `003B-4B-4`, `003B-4C`, `003B-4`, TASK-005, and #7 open, with no media HTTP. The range changes only the parenthetical on the next-cut sentence. It does not add a master-vigente section for #462.
- WIP `progress.md` adds `arranque 4C Ready sigue Unavailable`. PID 1 starts `.mount` and the worker, reads effective `CPUQuotaPerSecUSec` and `RestrictAddressFamilies`, and evaluates `ReadyAttestation`. The recorded result is `Unavailable`. Wire `READY` is `Unknown`. The entry does not mark `003B-4C`. It still names `Ready` and media HTTP as missing.
- WIP `meta.md` stays `implementation_in_progress`. After the merged #460 `CPUQuota` absence record, the handoff sentence now says the `Ready` cut stays `Unavailable` and does not close `003B-4C`. It does not record a merge SHA for #462. `003B-4B-3`, `003B-4B-4`, `003B-4C`, and aggregate `003B-4B` remain open. HTTP stays behind those gates.
- `plan.md` is outside the diff. `MEDIA-NORMALIZE-003B-4`, `003B-4B-3`, `003B-4B-4`, `MEDIA-NORMALIZE-003B-4C`, and TASK-005 remain `[ ]`. The aggregate `003B-4` is still the only cut that may return `Ready`. TASK-005 still closes only after the four sub-cuts, and none of them enable HTTP.
- ADR-001 is outside the diff. `Ready` still requires Linux amd64/arm64, cgroup v2, the dedicated user, `NoNewPrivileges`, namespaces, no `AF_INET`/`AF_INET6`, `KillMode=control-group`, `MemorySwapMax=0`, `memory.oom.group`, `TasksMax`, `CPUQuota`, RLIMIT, and SELF_TEST `Matched` inside that unit. Effective attestation must read the live unit and the real cgroup v2 files, including CPU. Absence, `Unknown`, a looser value, or an unreadable property produces `Unavailable`. This cut evaluates the two already-attested absences and keeps the result `Unavailable`. It does not supply a positive `CPUQuota`, a cgroup CPU reading, or a `Ready` variant.

## Hosted Verify and focused validations

Verify run `46094600247` is a completed `pull_request` run with conclusion `success` on exact head `afaf15dc24c4c1532fb69c9e91ed2f12c6fb4eeb`. `gh run view 46094600247 --json conclusion,headSha,event,status` returns that identity. The workflow name is Verify. All 7 jobs concluded `success` and `completed`. None were cancelled:

- repository-hygiene `140822968961`
- productive-routes-real-e2e `140823024451`
- media-broker `140823024455`
- media-broker-pid1 `140823024459`
- frontend `140823024487`
- backend `140823024488`
- unified-access-real-e2e `140823024495`

`media-broker-pid1` includes the step `Start derived tmpfs and worker units through PID 1`, which completed successfully. That job still runs `cargo +1.100.0 test --locked --all-targets -- --ignored --test-threads=1 pid1_`.

Name-only diff is exactly:

- `backend/media-broker/src/dbus.rs`
- `backend/media-broker/src/lib.rs`
- `backend/media-broker/src/ready.rs`
- `sdd/STATUS.md`
- `sdd/wip/20261116-catalog-media-upload-and-variant-gallery/4-implementation/progress.md`
- `sdd/wip/20261116-catalog-media-upload-and-variant-gallery/meta.md`

`backend/media-broker/src/lib.rs` still begins with `#![cfg(target_os = "linux")]` and `#![forbid(unsafe_code)]`, and now declares `pub mod ready`. Numstat is 85/0 `dbus.rs`, 1/0 `lib.rs`, 92/0 `ready.rs`, 1/1 `STATUS.md`, 7/0 `progress.md`, 2/1 `meta.md`.

## Architecture review

- `ReadyAttestation` is a closed enum with `Unavailable` and `Unknown` only. There is no `Ready` variant, so no caller can construct a successful Ready attestation. `from_wire` accepts only the exact string `UNAVAILABLE`. `from_wire("READY")` is `Unknown`, as are `unknown` and every other string. `Unknown` is not promoted to `Unavailable` or to a success state. Unit tests and both new dbus tests lock that wire edge.
- `from_effective` is the live evaluator. `cpu_quota_absent` matches the #460 sentinel set already attested for `CPUQuotaPerSecUSec`: empty, `~`, `infinity`, or `n/a` in any ASCII case. `families_unrestricted` matches the #458 sentinel set already attested for `RestrictAddressFamilies`: empty or `~`. Either condition returns `Unavailable`. The other arm also returns `Unavailable`, including the unit case `from_effective("100%", "AF_UNIX")`. A finite-looking quota together with `AF_UNIX` therefore stays `Unavailable`. A string that names `AF_INET` or `AF_INET6` is outside the unrestricted sentinel and still lands on `Unavailable`. The identical arms are the fail-closed shape of this cut: the type and the function both refuse to treat a partial match as `Ready`. `systemctl_property` trims `systemctl show -p <property> --value`, so the PID 1 strings are the same shape those predicates classify.
- PID 1 test `pid1_worker_ready_stays_unavailable` uses JobId `[0x3c; 16]`, distinct from the existing absence tests `[0x3a; 16]` (`RestrictAddressFamilies`) and `[0x3b; 16]` (`CPUQuotaPerSecUSec`). It starts the derived `.mount` and worker through PID 1, reads those two effective properties, and requires `from_effective` to be `Unavailable` and `from_wire("READY")` to be `Unknown`, then stops both units. The derived-property test `derived_worker_ready_stays_unavailable` still shows the requested worker properties omit `CPUQuota` and `RestrictAddressFamilies`, and evaluates `from_effective("", "")` as `Unavailable`. The pre-existing PID 1 tests that assert the raw absent sentinels are outside this diff and remain in the same `--test-threads=1 pid1_` job. This cut does not weaken those assertions and does not add the properties to `TransientUnits`.
- `ReadyAttestation` is referenced from `ready.rs` and the dbus tests only. Daemon, protocol, journal, reconcile, and Spring HTTP are outside the diff. No broker state transition becomes Ready. ADR-001's remaining requirements — positive `CPUQuota`, the live cgroup v2 CPU file, a positive no-`AF_INET`/`AF_INET6` attestation, namespaces, RLIMIT, and SELF_TEST `Matched` inside the unit — stay unmet. `Unavailable` here is the evaluation of attested absence plus an explicit refusal of the complementary case. It does not close `Ready`.
- STATUS, progress, and meta describe that result and leave `003B-4C` unmarked. No checkbox moves to `[x]`. `003B-4B-3`, `003B-4B-4`, `003B-4C`, `003B-4`, TASK-005, Ready, and media HTTP stay open. The range adds no secret, tag, deploy, or publish step.
- The GitHub body test-plan boxes remain unchecked. Hosted Verify `46094600247` is the evidence for this head. This review does not check off those boxes and does not treat `Unavailable` as the close of `003B-4C`.

## P0–P3

- P0: none
- P1: none
- P2: none
- P3: none

## Conclusion

The exact range adds a closed `ReadyAttestation` whose only cases are `Unavailable` and `Unknown`. Wire `READY` is `Unknown`. `from_effective` maps attested-absent `CPUQuotaPerSecUSec` (empty, `~`, `infinity`, or `n/a`) and attested-absent `RestrictAddressFamilies` (empty or `~`) to `Unavailable`, and it returns `Unavailable` for every other pair, including a finite-looking quota with `AF_UNIX`. PID 1 JobId `[0x3c;16]` reads those live properties and stays `Unavailable`. `lib.rs` keeps `#![forbid(unsafe_code)]` and exposes `pub mod ready`. Verify `46094600247` is 7/7 on `afaf15dc24c4c1532fb69c9e91ed2f12c6fb4eeb`. `003B-4C`, `003B-4B-3`, `003B-4B-4`, Ready, HTTP, and TASK-005 stay open. Architecture verdict: APPROVED with no P0–P3. This file is not a GitHub approval, and does not merge, retarget, or close those gates.
