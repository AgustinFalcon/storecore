VERDICT: APPROVED

## Evidence identity

- provider: xAI
- model: grok-4.7-medium-fast
- effort: medium
- lane: security
- authorized substitute after gpt-5.6-sol-medium quota
- independent of the architecture lane (this review did not read `sdd/reviews/20261127-sol-pr458-architecture.md`)
- PR: #458 OPEN, `feat(media): attest PID 1 leaves RestrictAddressFamilies unset`
- URL: https://github.com/AgustinFalcon/storecore/pull/458
- branch: `feat/media-broker-4c-restrict-address-families-20261127`
- base branch: `master`
- base SHA: `89908f8ebbb5546fcee73f3bcb73edcb0dbc2190`
- head SHA: `5c03b5f7027c9d1ea68c2df4cc6d86a619167dda`
- exact range: `89908f8ebbb5546fcee73f3bcb73edcb0dbc2190...5c03b5f7027c9d1ea68c2df4cc6d86a619167dda`
- diff identity: 4 files, 87 insertions, 6 deletions; the full three-dot diff was read
- superseded SHAs `490f623d8769f9b383d7aa776c77624dee3d4d5d` and `74f33860e402be5fded501b4ec5b70f0de49c24c` were not reviewed
- `git rev-parse HEAD` is `5c03b5f7027c9d1ea68c2df4cc6d86a619167dda`
- `git rev-parse origin/master` is `89908f8ebbb5546fcee73f3bcb73edcb0dbc2190`
- `gh pr view 458` reports state OPEN, the same title, base, head, and 87/6 counts
- `git diff --check` on the exact range exited 0 with no output
- the worktree was not checked out, committed, pushed, merged, or retargeted
- this file is not a GitHub approval, does not merge or retarget PR #458, and does not close or check off `003B-4C`, `003B-4B-3`, `003B-4B-4`, Ready, HTTP, or TASK-005

## PR intent and SDD why

`gh pr view 458` describes one cut: attest that PID 1 does not apply `RestrictAddressFamilies` to the derived worker, because HotSpot needs the default address-family set. The test plan keeps `CPUQuota`, Ready, and media HTTP out, and leaves `MEDIA-NORMALIZE-003B-4C` unchecked. The PR commits on this head are `4982f6e2262ace1825f1436fe80bf8c09322d7f4` and `5c03b5f7027c9d1ea68c2df4cc6d86a619167dda`. The second commit treats systemd `~` as the unset sentinel. Neither commit is an address-family allowlist.

STATUS on this head stays `En implementación`. The banner names the next cut as `CPUQuota` and `Ready`, records `ProtectHome` and `RestrictAddressFamilies` as attested absent, leaves `CPUQuota` out, and says the document does not close `003B-4C`. `003B-4B-3`, `003B-4B-4`, `003B-4C`, `003B-4`, TASK-005, and #7 stay open. The banner says this cut adds no media HTTP. The previous master paragraph still describes PR #455 and still says socket family and `Ready` were missing there. It does not claim this PR is merged.

Progress adds `2026-11-27 — arranque 4C RestrictAddressFamilies ausente`. It says PID 1 does not apply the property, the harness starts the `.mount` and the worker, reads the effective property, and stops both units. It says `003B-4C` is not marked and that `CPUQuota`, `Ready`, and media HTTP remain. Meta moves the in-implementation pointer to `RestrictAddressFamilies` absent and says that cut does not cover `CPUQuota` or `Ready`. It does not check `003B-4C`, `003B-4B-3`, or `003B-4B-4`.

ADR-001 still requires effective attestation of UID/GID, `NoNewPrivileges`, namespaces, socket family, `KillMode`, swap, OOM group, memory, pids, CPU, runtime, RLIMIT, mount/quota, runtime path/digest, and terminal state. Absence, `Unknown`, a laxer value, or an unreadable value yields `Unavailable`. That rule is unchanged by this diff. `plan.md` still has `- [ ] MEDIA-NORMALIZE-003B-4C` and the same open boxes for `003B-4B-3` and `003B-4B-4`. `plan.md` is not in the diff. This cut attests an intentional omission. It does not supply the ADR's positive socket-family proof and does not close the gate.

## Hosted Verify and focused validations

Verify run `46078357930` is a completed `pull_request` run with conclusion `success` on exact head `5c03b5f7027c9d1ea68c2df4cc6d86a619167dda`. All 7 jobs succeeded and completed. None were cancelled:

- repository-hygiene `140771297880`
- frontend `140771359948`
- backend `140771359952`
- media-broker `140771359965`
- productive-routes-real-e2e `140771359981`
- media-broker-pid1 `140771360022`
- unified-access-real-e2e `140771360113`

`media-broker` job `140771359965` records `test dbus::tests::derived_worker_restrict_address_families ... ok` and `test result: ok. 88 passed; 0 failed; 44 ignored`.

`media-broker-pid1` job `140771360022` records `test dbus::tests::pid1_worker_restrict_address_families ... ok` and `test result: ok. 44 passed; 0 failed; 0 ignored`. The harness that produced that line is the only `JobId::create([0x3a; 16])` in `backend/media-broker/src/dbus.rs`. The log line does not print the byte array. The source of the passing test does.

`backend/media-broker/src/lib.rs` is outside the diff. Line 2 is still `#![forbid(unsafe_code)]`.

Name-only diff is only:

- `backend/media-broker/src/dbus.rs`
- `sdd/STATUS.md`
- `sdd/wip/20261116-catalog-media-upload-and-variant-gallery/4-implementation/progress.md`
- `sdd/wip/20261116-catalog-media-upload-and-variant-gallery/meta.md`

## Security review

`worker_properties` is unchanged. The requested worker vector still sets `PrivateNetwork=true` and the existing hardening keys. It still has no `RestrictAddressFamilies`, no `ProtectHome`, and no `CPUQuota`. `LimitCPU` remains `RLIMIT_CPU` and is not retargeted to `CPUQuota`. The diff adds assertions. It does not insert a family list, an `AF_UNIX` allowlist, or a `~AF_*` blacklist.

`derived_worker_restrict_address_families` builds the derived worker and asserts the property keys omit `RestrictAddressFamilies`, `ProtectHome`, and `CPUQuota`. That is the same omission class as the existing `ProtectHome` unit assertions: the key is absent from the transient properties, so PID 1 is not asked to apply it.

`pid1_worker_restrict_address_families` is ignored unless the process is root, PID 1 is systemd, and the system bus is available. It uses `JobId::create([0x3a; 16])`, starts the derived `.mount`, writes the self-test request, and starts the worker. A failed `StartTransientUnit` dumps the unit and panics. That failure is not treated as a successful omission. After start, `systemctl show -p RestrictAddressFamilies --value` must be empty or exactly `~` after trim. Empty is the unset rendering. Exact `~` is the systemd unset/reset sentinel for this property, which is why the second commit exists. A whitelist, or a blacklist prefix with families such as `~AF_UNIX` or `~ AF_INET`, does not compare equal to `~` and fails the assertion. The harness then stops the worker and the mount and accepts only `Inactive` or `Failed`.

Leaving the property unset is the fail-closed choice for this worker. HotSpot needs the default family set. Applying `RestrictAddressFamilies` is the same class of break as `ProtectHome` (`ENXIO` / unset), not a tighter sandbox. Host-network isolation for this unit continues to rest on `PrivateNetwork=true`, which this diff does not remove. The harness does not claim a kernel seccomp read or a positive family restriction. ADR-001 still requires that positive socket-family attestation before `003B-4C` can close. STATUS, progress, meta, and `plan.md` keep that gate open.

The live harness does not re-read `CPUQuota`. The production vector and the new unit test still omit that key. `CPUQuota` stays an open residual, not a property this cut applies.

Progress says the harness reads the effective property as empty. The assertion also accepts the exact `~` sentinel. The security predicate is the assertion, which matches the PID 1 evidence this cut is allowed to accept. That wording does not widen the accepted values.

The four-file diff adds no secret, credential, HTTP route, capability `Ready`, deploy, tag, or publish behavior. It does not retarget Java and does not change workflow, DDL, or a client-supplied property path.

## Open residuals

- positive socket-family attestation required by ADR-001 before `003B-4C` can close
- `CPUQuota` still unset and still outside this cut
- `003B-4B-3`, `003B-4B-4`, `003B-4C`, `003B-4`, TASK-005, and `Ready`
- media HTTP, multipart, provider live, secrets, deploy, tag, and publish

## Findings

P0: none.

P1: none.

P2: none.

P3: none.

## Verdict

APPROVED for exact head `5c03b5f7027c9d1ea68c2df4cc6d86a619167dda` over base `89908f8ebbb5546fcee73f3bcb73edcb0dbc2190`. Verify `46078357930` is independently confirmed final 7/7 on that head. PID 1 recorded `pid1_worker_restrict_address_families ... ok` for the harness whose `JobId` is `[0x3a; 16]`. `RestrictAddressFamilies` stays omitted. An empty effective value or the systemd `~` unset sentinel is the accepted evidence that PID 1 did not apply it. `CPUQuota` stays unset. This file is not a GitHub approval and does not merge, retarget, or close `003B-4C`, `003B-4B-3`, `003B-4B-4`, Ready, HTTP, or TASK-005.
