VERDICT: APPROVED

## Evidence identity

- provider: xAI
- model: grok-4.7-medium-fast
- effort: medium
- lane: architecture
- authorized substitute after gpt-5.6-sol-medium quota
- independent of the security lane (this review did not read `sdd/reviews/20261127-sol-pr458-security.md`)
- PR: #458 OPEN, `feat(media): attest PID 1 leaves RestrictAddressFamilies unset`
- URL: https://github.com/AgustinFalcon/storecore/pull/458
- branch: `feat/media-broker-4c-restrict-address-families-20261127`
- base branch: `master`
- base SHA: `89908f8ebbb5546fcee73f3bcb73edcb0dbc2190`
- head SHA: `5c03b5f7027c9d1ea68c2df4cc6d86a619167dda`
- exact range: `89908f8ebbb5546fcee73f3bcb73edcb0dbc2190...5c03b5f7027c9d1ea68c2df4cc6d86a619167dda`
- diff identity: 4 files, 87 insertions, 6 deletions; the full three-dot diff was read
- superseded SHAs `490f623d8769f9b383d7aa776c77624dee3d4d5d` and `74f33860e402be5fded501b4ec5b70f0de49c24c` are not the reviewed head
- `git diff --check` on that range exited 0 with no output
- `git rev-parse HEAD` is `5c03b5f7027c9d1ea68c2df4cc6d86a619167dda`
- `git rev-parse origin/master` is `89908f8ebbb5546fcee73f3bcb73edcb0dbc2190`
- no checkout, commit, push, or merge was performed
- this file is not a GitHub approval, does not merge or retarget, and does not close or check off `003B-4C`, `003B-4B-3`, `003B-4B-4`, Ready, HTTP, or TASK-005

## PR intent and SDD why

`gh pr view 458` reports the expected OPEN implementation PR. The body attests that PID 1 does not apply `RestrictAddressFamilies` to the derived worker, because HotSpot needs the default family set. The harness is the unit test plus JobId `[0x3a;16]`. `CPUQuota`, Ready, and HTTP stay out, and `003B-4C` stays open. The GitHub test-plan boxes remain unchecked.

On head `5c03b5f7027c9d1ea68c2df4cc6d86a619167dda`:

- `sdd/STATUS.md` stays `En implementación`. The banner moves the next cut to `CPUQuota` and `Ready`. Restart after `Allocated`, `InputSealed`, `Starting`, `Running`, `Terminating`, `Terminal`, and `Quarantined`, expected and unexpected Active inventory, mmap, FD, terminals without ACK, global quota, and RLIMIT stay attested. `ProtectHome` and `RestrictAddressFamilies` are recorded as attested absent. `CPUQuota` stays out. The banner says this document does not close `003B-4C`, still lacks `CPUQuota` and `Ready`, and leaves `003B-4B-3`, `003B-4B-4`, `003B-4C`, `003B-4`, TASK-005, and #7 open, with no media HTTP. It does not add a master section for #458.
- WIP `progress.md` adds `arranque 4C RestrictAddressFamilies ausente`: PID 1 does not apply the property to the derived worker; the harness starts `.mount` and the worker, reads the effective property, and stops both units. It does not mark `003B-4C`. It still names `CPUQuota`, `Ready`, and media HTTP as missing.
- WIP `meta.md` stays `implementation_in_progress`. PR #455 remains unexpected Active inventory and still does not cover sockets or `Ready`. The following sentence names the `RestrictAddressFamilies` absence cut as in implementation and still excludes `CPUQuota` and `Ready`. `003B-4B-3`, `003B-4B-4`, and `003B-4C` remain open.
- `plan.md` is outside the diff. `MEDIA-NORMALIZE-003B-4C` remains `[ ]`, as do `003B-4B-3`, `003B-4B-4`, and TASK-005. TASK-005 still closes only after the four sub-cuts, and none of them enable HTTP.
- ADR-001 is outside the diff. `Ready` still requires Linux amd64/arm64, cgroup v2, the dedicated user, `NoNewPrivileges`, namespaces, no `AF_INET`/`AF_INET6`, `KillMode=control-group`, `MemorySwapMax=0`, `memory.oom.group`, `TasksMax`, `CPUQuota`, RLIMIT, and SELF_TEST `Matched` inside that unit. Effective attestation must read the live unit and cgroup, including socket family. Absence, `Unknown`, a looser value, or an unreadable property produces `Unavailable`. This head does not produce `Ready` and does not treat an unset `RestrictAddressFamilies` as that restriction.

## Hosted Verify and focused validations

Verify run `46078357930` is a completed `pull_request` run with conclusion `success` on exact head `5c03b5f7027c9d1ea68c2df4cc6d86a619167dda`. All 7 jobs concluded `success`. None were cancelled:

- repository-hygiene `140771297880`
- frontend `140771359948`
- backend `140771359952`
- media-broker `140771359965`
- productive-routes-real-e2e `140771359981`
- media-broker-pid1 `140771360022`
- unified-access-real-e2e `140771360113`

The pid1 job log records `test dbus::tests::pid1_worker_restrict_address_families ... ok`. The test that passed binds `JobId::create([0x3a; 16])`, which is the worker unit `storecore-media-` plus 32 hex chars of `3a` plus `.service`. The ok line itself does not print that id.

The first pid1 attempt, run `46074982426` on superseded SHA `490f623d8769f9b383d7aa776c77624dee3d4d5d`, failed in the same test with `PID 1 must not apply RestrictAddressFamilies, got ~`. That SHA is not this review. The landed assert accepts an empty show value or the systemd unset sentinel `~`. Exact equality with `~` rejects a family list and rejects a reset-prefix plus names. That is attestation that the property is not applied, not an allowlist.

`backend/media-broker/src/lib.rs` is absent from the range. On this head it still begins with `#![cfg(target_os = "linux")]` and `#![forbid(unsafe_code)]`.

Name-only diff is exactly:

- `backend/media-broker/src/dbus.rs`
- `sdd/STATUS.md`
- `sdd/wip/20261116-catalog-media-upload-and-variant-gallery/4-implementation/progress.md`
- `sdd/wip/20261116-catalog-media-upload-and-variant-gallery/meta.md`

## Architecture review

- `worker_properties` is unchanged as a property table. The diff adds no `RestrictAddressFamilies` key, no `ProtectHome` key, and no `CPUQuota` key. `start_transient` still loads worker properties only through `properties` → `worker_properties`. The new derived test builds `TransientUnits::derive` and asserts those three keys are absent. `PrivateNetwork=true` remains a separate, already derived property. It is not a socket-family allowlist and it does not stand in for `RestrictAddressFamilies`.
- The ignored PID 1 test uses the same derive path, starts the `.mount`, writes the self-test request, starts the worker, and fails the start closed if `StartTransientUnit` errors after leaving the property unset. It then reads `systemctl show -p RestrictAddressFamilies --value`. Success is only `""` or `"~"`. The failure text is `PID 1 must not apply RestrictAddressFamilies`. The harness then stops the worker and the mount and accepts `Inactive` or `Failed` for each. It does not assert an `AF_*` list, and it does not assert that `AF_INET` or `AF_INET6` is denied.
- `ProtectHome` and `CPUQuota` stay unset on this head. The new derived test repeats their absence. The PID 1 test does not read them again. `ProtectHome` was already an absence attestation (`no`, `false`, or empty). `CPUQuota` stays outside this cut, matching STATUS and progress.
- ADR-001 still requires no `AF_INET`/`AF_INET6` before `Ready`, and treats a missing socket-family reading as `Unavailable`. This slice records the opposite observation: PID 1's effective value is the unset sentinel. STATUS therefore lists `RestrictAddressFamilies` as attested absent and moves the next cut to `CPUQuota` and `Ready`. That banner does not check `MEDIA-NORMALIZE-003B-4C` and does not claim `Ready`. Progress's "propiedad efectiva vacía" is the absence shorthand; the landed predicate, and the `got ~` failure on `490f623`, are the precise contract. `~` is not recorded as a permitted family set.
- No checkbox moves to `[x]`. `003B-4B-3`, `003B-4B-4`, `003B-4C`, `003B-4`, TASK-005, Ready, and media HTTP stay open. The range adds no HTTP route, secret, tag, deploy, or publish step, and it does not change reconcile or the durable state set.

## P0–P3

- P0: none
- P1: none
- P2: none
- P3: none

## Conclusion

The exact head attests that derived worker properties omit `RestrictAddressFamilies` and that PID 1's effective value is empty or the unset sentinel `~`. The first pid1 attempt on `490f623` failed with `got ~`; the landed assert accepts that sentinel and does not accept a family allowlist. `ProtectHome` and `CPUQuota` stay unset. Verify `46078357930` is 7/7 on `5c03b5f7027c9d1ea68c2df4cc6d86a619167dda`, and the PID 1 log records `pid1_worker_restrict_address_families ... ok` for JobId `[0x3a; 16]`. `lib.rs` is unchanged and still `#![forbid(unsafe_code)]`. `003B-4C`, `003B-4B-3`, `003B-4B-4`, Ready, HTTP, and TASK-005 stay open. Architecture verdict: APPROVED with no P0–P3. This file is not a merge or a GitHub approval.
