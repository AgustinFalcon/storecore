VERDICT: APPROVED

## Evidence identity

- provider: Cursor
- model: grok-4.7-medium-fast
- effort: medium
- substitute-for: gpt-5.6-sol-medium (user-authorized; Sol usage limit)
- lane: architecture
- PR: 320 OPEN, `feat/media-broker-daemon-4b3-20261120`, title `feat(media): derive broker mount and worker units`
- git rev-parse HEAD: `35b8ce711a6c07e7a1aa5e4b418c9031f9024070`
- head SHA reviewed: `35b8ce711a6c07e7a1aa5e4b418c9031f9024070` (matches required SHA)
- GitHub baseRefOid / three-dot merge-base: `74152810031ec820dc52cd43bf8a4ef1120abec3`
- origin/master tip: `dd5c9a0060d2438014d17d463002f1676523c7f1` (two docs commits after the merge-base; not part of this diff)
- Verify run: `44856904469` (`pull_request`, completed, conclusion `success`, headSha `35b8ce711a6c07e7a1aa5e4b418c9031f9024070`)
- local cargo: not run (toolchain not used; no local result is claimed)

## Job conclusions (Verify 44856904469)

All six required jobs are `completed` / `success`, not cancelled:

- repository-hygiene: success (`136701114720`)
- backend: success (`136701189428`)
- media-broker: success (`136701189417`)
- frontend: success (`136701189404`)
- productive-routes-real-e2e: success (`136701189447`)
- unified-access-real-e2e: success (`136701189421`)

## Why this cut

`003B-4B-3` in `plan.md` is still unchecked. The spec residual `003B-4B` and ADR-001 section 4B-3 define this slice as a hardened daemon, an approved root-owned runtime, and transient `.mount` / worker units owned by PID 1, with names, paths, and properties derived internally. The progress note `2026-11-20 — 003B-4B-3 en implementación` and the PR body describe the start of that slice: closed unit / D-Bus / runtime types, `.mount` / `.scope` names derived only from `JobId`, Java/jar opened `NOFOLLOW` with an approved digest, and a start path that cannot treat D-Bus `Unknown` as `Running`. They do not claim `Ready`, do not check off the 4B-3 aggregate, and do not close 4B-4, 4C, or 004. `BrokerOperation` is still only `SealInput` / `Unknown`. That scope claim matches the diff.

## Diff

`git diff --stat origin/master...HEAD` (merge-base `7415281`): 8 files, **1770 insertions, 3 deletions**.

- A `backend/media-broker/src/daemon.rs` (+666)
- M `backend/media-broker/src/journal.rs` (+18/−2)
- M `backend/media-broker/src/lib.rs` (+4)
- A `backend/media-broker/src/runtime.rs` (+493)
- M `backend/media-broker/src/store.rs` (+36/−1)
- A `backend/media-broker/src/systemd.rs` (+376)
- A `backend/media-broker/src/unit.rs` (+167)
- M `sdd/wip/20261116-catalog-media-upload-and-variant-gallery/4-implementation/progress.md` (+10)

No Spring wiring, no `Ready`, no protocol opcode for start, no client unit name / `Where` / `ExecStart`.

## Prior findings on 036976d, re-checked on 35b8ce7

Both previous architecture P2s are closed in this head. They were not copied forward.

1. Stop attestation no longer treats `Activating` or `Deactivating` as cleared. `unit_cleared` is only `Ok(Inactive | Failed)`. `start_quarantines_when_stop_stays_in_transition` drives `FakeSystemd.stop_as` for both states and expects `Quarantined`, `AdmissionBlock::ReconciliationMismatch`, and `DurableBlockReason::ReconciliationMismatch`.
2. A failed stop after the `Running` journal block still quarantines. `rollback_units` calls `quarantine_and_latch` whenever either stop is not cleared, and that helper does not require `AdmissionStatus::Open`. `transition_internal` still persists `Quarantined` when admission is already `JournalFailure`. `start_quarantines_when_running_persist_and_stop_fail` arms `fail_persist_after_rename_skipping(1)` plus `fail_stop` and expects `Quarantined` plus the durable reconciliation latch. `block()` would have kept the memory-only `JournalFailure`; the explicit admission assignment after `block_durably` is what makes the latch the visible gate on this path.

Earlier closures still hold: rollback calls `stop` for worker then mount and branches on the returned state; approved paths are absolute; every component is `NOFOLLOW` plus parent trust; `confirm` rechecks owner, mode `0o7777`, nlink, digest, and dev/ino; leaf and directory opens use `O_NONBLOCK`; `WorkerSpec` carries the approved java/jar paths and digests; setuid/setgid/sticky fail the mode check.

## Review

`BrokerDaemon::start` takes job, revision, principal, and time. It refuses an unsealed job and a principal mismatch before any unit call, reconfirms the approved runtime before `Starting`, and derives `TransientUnits` only from `JobId`, the daemon mount root, the worker principal, and `ApprovedRuntime`. `MountSpec` / `WorkerSpec` have no public constructor. `start_kind` accepts only `UnitState::Active` from both `start_transient` and `attest`; `Ok(Unknown)` and `Err(UnknownState)` stay `SystemdError::UnknownState` and do not become `Running`.

Closed enums (`UnitKind`, `UnitState`, `DbusMethod`, `RuntimeKind`, `DaemonError`, `SystemdError`, `RuntimeError`) translate unknown wire values once. The journal skip counter preserves the old one-shot `fail_next_persist_after_rename` behavior.

## Residuals (not findings)

- `FakeSystemd` and no `zbus` lockfile. Real D-Bus method calls, transient properties, and restart enumeration through this controller remain inside 4B-3. This SHA still fail-closes on `Unknown` and does not accept a client unit name, `Where`, or `ExecStart`.
- The zbus slice has to speak PID 1’s own names: a `.mount` unit must be the escaped `Where` path, and a `.scope` does not spawn Java. `WorkerSpec` already holds the approved paths and digests for that later `ExecStart`. Unit names are not written into the journal.
- cgroup attestation, per-job quota proof, Spring `BrokeredMediaByteNormalizer`, and `Ready` stay in 4B-4 / 4C / 004.
- `origin/master` has moved by docs commits `ab38351` and `dd5c9a0`. They are outside this three-dot diff.

## Findings

No P0. No P1. No P2. No P3.
