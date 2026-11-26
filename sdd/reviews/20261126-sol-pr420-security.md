VERDICT: APPROVED

## Evidence identity

- provider: OpenAI
- model: gpt-5.6-sol-medium
- effort: medium
- lane: security
- independent of the architecture lane; no PR 420 architecture review or architecture-lane draft was read
- PR: 420 OPEN, `feat(media): attest PID 1 global job budget on the second allocation`
- branch: `feat/media-broker-4c-global-quota-20261126`
- head SHA: `f63631a062d4c4d986cdd3445a6811d06637f663`
- PR base SHA: `e0b918e7e22f0f53d90d6292da9cbb0fc8bdce26`
- exact review range: `e0b918e7e22f0f53d90d6292da9cbb0fc8bdce26...f63631a062d4c4d986cdd3445a6811d06637f663`
- diff identity: 5 files, +140/−10; commits `8c6cca200e8d75d669db6b9b38479cffe3d6bd5c` (`feat`) and `f63631a062d4c4d986cdd3445a6811d06637f663` (`rustfmt`)
- files: `backend/media-broker/src/dbus.rs`, `backend/media-broker/src/store.rs`, `sdd/STATUS.md`, WIP `progress.md`, WIP `meta.md`
- `origin/master` movement after the PR base is outside this review; PR #421 is not part of the range
- `git diff --check` on the exact three-dot range: clean
- Verify: `45887600304`, attempt 1, event `pull_request`, `completed` / `success`, headSha `f63631a062d4c4d986cdd3445a6811d06637f663`
- this file is not a GitHub approval and does not close `003B-4C`

## Hosted Verify

All 7 jobs are `completed` / `success`; none is cancelled:

- repository-hygiene `140142101433`
- media-broker `140142179595`
- media-broker-pid1 `140142179687`
- backend `140142179679`
- frontend `140142179754`
- productive-routes-real-e2e `140142179691`
- unified-access-real-e2e `140142179568`

The `media-broker-pid1` log contains
`pid1_global_job_budget_rejects_second_allocation ... ok` and
`test result: ok. 32 passed; 0 failed; 0 ignored; 0 measured; 79 filtered out`.
The same exact-head PID 1 run also contains
`pid1_starts_and_stops_derived_tmpfs_mount ... ok`, which reads
`/proc/self/mountinfo` and proves the internally derived mount is an effective
tmpfs. The job used UID/GID 2101 for the backend principal and 2102 for the
worker principal. The pinned Java remains Temurin `21.0.13+9`;
`.github/workflows/verify.yml` is not in this diff and was not retargeted.

I did not rerun the root/PID 1 harness on the Windows review host. The hosted
run above is the independent exact-head execution evidence.

## Why this cut

The PR body, current STATUS, the `003B-4C` spec paragraph, ADR-001, and the
unchecked plan item agree on the narrow purpose: prove that a global
`BudgetLimits` job cap applies across multiple allocations, not merely inside
one job. With `jobs=1`, the first durable allocation and PID 1 mount succeed;
the second allocation returns closed `BudgetError::JobLimit`, and the derived
second mount attests `SystemdError::NotLoaded`.

`MEDIA-NORMALIZE-003B-4C` remains `[ ]`. This cut does not claim Ready, sockets,
terminal-without-ACK handling, FD/mmap-after-seal evidence, restart coverage,
or HTTP media.

## Implementation and security ledger

- `BrokerStore::allocate` computes `candidate_usage` through checked
  `BudgetUsage::admit` before persisting or mutating records. `verify` checks
  the global jobs cap first and returns closed `JobLimit`; rejection leaves the
  first durable record and usage of one job unchanged.
- The focused store test proves the second allocation is rejected, the first
  record is unchanged, usage remains one, and admission remains open. Existing
  `budget.rs` behavior still counts every durable record, including
  `Terminal` without ACK; this cut does not claim that terminal reservations
  are released.
- The PID 1 harness requires `/proc/1/comm == systemd` and euid 0. It creates
  `/run/storecore_media/journal-4c-global-quota` with mode 0700, passes euid 0
  as the expected owner, and opens it through `BrokerStore::open`.
  `Journal::open` uses `O_NOFOLLOW`, validates directory type, owner and no
  group/other permissions, then holds a non-blocking exclusive `flock`.
  The store is explicitly dropped before `remove_dir_all`.
- The first allocation is bound to principal UID/GID 2101. Its transient mount
  is internally derived for worker UID/GID 2102 and started through the system
  bus `StartTransientUnit`. The exact-head PID 1 suite proves that this derived
  path is an effective tmpfs. The second allocation fails before any second
  `StartTransientUnit`; an exact derived-unit lookup must return `NotLoaded`.
- Isolation is not weakened. `TransientUnits::derive` still derives `Where`,
  `.mount` and `.service` names, tmpfs options and worker identity from job
  identity plus root-owned configuration. Mount options remain
  `nosuid,nodev,noexec,size=48M,nr_inodes=1024,mode=03770,uid=0,gid=2102`.
- No client-supplied D-Bus properties, paths, methods, unit names or commands
  are introduced. `StartTransientUnit` receives only internal property vectors
  and an empty auxiliary vector.
- `ProtectHome`, `CPUQuota`, and `RestrictAddressFamilies` remain unset.
  `PrivateUsers` and `MemoryDenyWriteExecute` remain absent. Existing namespace,
  cgroup, RLIMIT, kill and mount controls are unchanged by this diff.
- The diff adds no HTTP route, media activation, secret, credential, deploy,
  tag or publish behavior.

## Existing review and standards application

Applied the existing security conclusions in
`20261120-sol-pr319-security.md` (checked aggregate arithmetic, journal
ownership/locking, terminal reservation retention),
`20261121-sol-pr332-security.md` (PID 1 tmpfs and fail-closed `NotLoaded`),
`20261124-sol-pr360-security.md` (derived systemd authority and open 4C
residuals), and `20261126-sol-pr416-security.md` (current worker hardening
property boundaries). No previously closed control is weakened.

Closed-domain-states remains satisfied: `BudgetError`, `AdmissionStatus`,
`JobState`, `UnitKind`, `UnitState`, and `SystemdError` are closed Rust enums;
wire states retain `Unknown`/fail-closed handling. This test adds no stringly
typed domain state or alternate wire translator.

## Residual 4C list

Open and not accredited by this cut:

- terminals without ACK and their reconciliation/TTL behavior
- socket-family attestation; `RestrictAddressFamilies` remains unset
- retained FD/mmap mutation attempts after the input seal
- restart/reconciliation at every durable transition
- full effective mount quota coverage beyond this global `JobLimit` cut
- `ProtectHome`, `CPUQuota`, `PrivateUsers`, and `MemoryDenyWriteExecute`
- aggregate `003B-4B-3`, `003B-4B-4`, `003B-4C`, `003B-4`, TASK-005, Ready
- media HTTP, multipart, provider live, secrets, deploy, tag and publish

## Findings

P0: none.

P1: none.

P2: none.

P3: none.

## Verdict

APPROVED for exact head `f63631a062d4c4d986cdd3445a6811d06637f663`
over PR base `e0b918e7e22f0f53d90d6292da9cbb0fc8bdce26`. Verify
`45887600304` is 7/7 on that head. `003B-4C`, Ready, and HTTP remain open.
