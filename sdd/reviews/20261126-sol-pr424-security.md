VERDICT: APPROVED

## Evidence identity

- provider: OpenAI
- model: gpt-5.6-sol-medium
- effort: medium
- lane: security
- independent of the architecture lane; no PR #424 architecture review or architecture-lane draft was read
- PR: #424, `feat(media): attest PID 1 terminal jobs keep budget without ACK`
- branch: `feat/media-broker-4c-terminal-without-ack-20261126`
- head SHA: `c75a7e1c959ec27459ba5d22023ae90db92df90a`
- PR base SHA: `99ee22f5793d4a1a94f2eecf18f099c2425d9b36`
- exact review range: `99ee22f5793d4a1a94f2eecf18f099c2425d9b36...c75a7e1c959ec27459ba5d22023ae90db92df90a`
- diff identity: 5 files, +209/-9
- files: `backend/media-broker/src/dbus.rs`, `backend/media-broker/src/store.rs`, `sdd/STATUS.md`, WIP `progress.md`, WIP `meta.md`
- `git diff --check` on the exact three-dot range: clean
- Verify: `45898587594`, event `pull_request`, `completed` / `success`, headSha `c75a7e1c959ec27459ba5d22023ae90db92df90a`
- this file is not a GitHub approval and does not close `003B-4C`

## Hosted Verify

All 7 jobs completed successfully:

- repository-hygiene `140178540938`
- media-broker `140178612579`
- media-broker-pid1 `140178612219`
- backend `140178612207`
- frontend `140178612214`
- productive-routes-real-e2e `140178612220`
- unified-access-real-e2e `140178612256`

The exact-head `media-broker-pid1` log contains
`pid1_terminal_without_ack_retains_the_mount_and_job_budget ... ok` and
`test result: ok. 33 passed; 0 failed; 0 ignored; 0 measured; 80 filtered out`.
The regular broker job also passed 80 tests, with no failures. The workflow
kept the pinned Temurin `21.0.13+9`; the workflow is outside this diff and was
not retargeted.

The Windows review host has no `cargo` executable, so the focused local command
could not run. The independent root/PID 1 evidence is the successful hosted
exact-head run above.

## Why this cut

The PR body, STATUS rationale, `003B-4C` specification, and ADR-001 agree on the
narrow security property: a `Terminal` job without `AckOutput` retains its full
global jobs/bytes/mounts reservation. This is aggregate admission control, not
a per-job quota. With a one-job global limit, the next allocation must fail
closed with `BudgetError::JobLimit`; PID 1 must leave the first mount active and
must not load a second mount.

This cut does not claim `003B-4C`, Ready, socket-family attestation, FD/mmap
post-seal evidence, restart coverage, or HTTP media.

## Security review

- `BrokerStore` rebuilds aggregate usage from all durable records after each
  transition. `BudgetUsage::with_record` counts every record, including
  `Terminal`, in jobs and mounts and retains its bytes/inodes outside the
  separate quarantine pool.
- The focused store regression reaches `Terminal` without ACK, confirms jobs
  and bytes remain reserved, and proves the next allocation fails closed with
  `JobLimit`. Existing budget coverage confirms the same terminal record keeps
  mounts and inodes.
- The PID 1 regression uses the same one-job store, starts the internally
  derived first `.mount`, reaches `Terminal` without ACK, observes that mount
  still `Active`, rejects the next allocation with `JobLimit`, and verifies the
  second derived mount is `NotLoaded`. It performs the first mount stop only as
  explicit test cleanup after these assertions; no production cleanup-on-
  terminal behavior is introduced.
- The PID 1 journal fixture is root-owned and mode `0700`; journal validation,
  durable records, checked budget arithmetic, and fail-closed admission paths
  are unchanged.
- No client D-Bus property, method, unit name, path, command, or arbitrary
  argument is added. The runtime diff adds tests and helpers only.
- Existing namespace, mount, cgroup, RLIMIT, process-identity, runtime-digest,
  and systemd authority controls are not weakened. The first mount remains
  owned by PID 1 and the second is never loaded after admission fails.
- No HTTP route, socket contract, media activation, secret, credential, deploy,
  tag, publish, or live-provider behavior is added.
- Closed-state handling remains fail-closed: `JobState`, `BudgetError`,
  `AdmissionStatus`, `UnitState`, and `SystemdError` remain closed Rust enums.

## Open residuals

Still open and not accredited by this cut:

- FD/mmap mutation attempts after sealing
- restart/reconciliation at each durable transition
- socket-family attestation and `RestrictAddressFamilies`
- remaining effective hardening gaps including `CPUQuota` and `ProtectHome`
- aggregate `003B-4B-3`, `003B-4B-4`, `003B-4C`, `003B-4`, TASK-005, and Ready
- media HTTP, multipart, provider live, secrets, deploy, tag, and publish

## Findings

P0: none.

P1: none.

P2: none.

P3: none.

## Verdict

APPROVED for exact head `c75a7e1c959ec27459ba5d22023ae90db92df90a`
over PR base `99ee22f5793d4a1a94f2eecf18f099c2425d9b36`. Verify
`45898587594` is independently confirmed 7/7 on that head. This is not a
GitHub approval; `003B-4C`, Ready, and HTTP remain open.
