VERDICT: APPROVED

## Evidence identity

- provider: OpenAI
- model: gpt-5.6-sol-medium
- effort: medium
- lane: architecture
- independent of the security lane. This review did not read the security-lane
  file.
- PR: 424 OPEN, `feat(media): attest PID 1 terminal jobs keep budget without ACK`
  https://github.com/AgustinFalcon/storecore/pull/424
- branch: `feat/media-broker-4c-terminal-without-ack-20261126`
- head SHA: `c75a7e1c959ec27459ba5d22023ae90db92df90a`
- PR base SHA: `99ee22f5793d4a1a94f2eecf18f099c2425d9b36`
- checkout at review time: HEAD
  `c75a7e1c959ec27459ba5d22023ae90db92df90a`; `origin/master`
  `99ee22f5793d4a1a94f2eecf18f099c2425d9b36`.
- Verify: `45898587594`, attempt 1, event `pull_request`, status `completed`,
  conclusion `success`, headSha
  `c75a7e1c959ec27459ba5d22023ae90db92df90a`.
- exact diff:
  `git diff 99ee22f5793d4a1a94f2eecf18f099c2425d9b36...c75a7e1c959ec27459ba5d22023ae90db92df90a`
  is 5 files, +209 / -9. The full three-dot diff was read.
- `git diff --check
  99ee22f5793d4a1a94f2eecf18f099c2425d9b36...c75a7e1c959ec27459ba5d22023ae90db92df90a`
  exited 0 with no output.
- commits in the range:
  `75dd2c7de1ba8e996e1ab0fd74dcc8a13343c9b2` (`feat`),
  `fa801dbc62868015e080ccb979d40ee26de18c72` (`rustfmt`), and
  `c75a7e1c959ec27459ba5d22023ae90db92df90a` (`clippy helpers`).
- the pre-existing untracked persist review leftovers were not staged or
  modified.
- local cargo was not rerun on this Windows host. The focused Linux and real
  PID 1 evidence is the successful hosted exact-head Verify identified above.
- this file is not a GitHub approval, does not merge the PR, and does not close
  `003B-4C`.

## PR intent and SDD why

`gh pr view 424` reports the expected base, head, branch, three commits, and
5-file +209/-9 scope. The PR body limits the cut to terminal jobs without
`AckOutput`: the terminal record retains the global reservation, the next
allocation fails closed with `BudgetError::JobLimit`, and PID 1 keeps the first
`.mount` active while no second unit is loaded. It explicitly leaves
`003B-4C`, `Ready`, sockets, FD/mmap, restart, and HTTP media open.

The canonical sources agree:

- `sdd/STATUS.md` says the terminal job retains the reservation, the second
  allocate fails `JobLimit`, PID 1 does not unmount the first `.mount`, and
  `003B-4C` remains open.
- the technical spec's `003B-4C` paragraph still requires the complete real
  Linux harness: SELF_TEST/NORMALIZE, cross-job isolation, per-job and global
  quota, terminals without ACK, retained FD/mmap after seal, OOM/timeout,
  cgroup termination, substitution rejection, and restart recovery at every
  durable transition.
- ADR-001 requires terminal work without ACK to retain evidence and budget,
  says the harness covers multiple allocations and terminals without ACK, and
  permits only `003B-4A+4B+4C` to complete `003B-4`.
- `3-tasks/plan.md` still has
  `MEDIA-NORMALIZE-003B-4C` at `[ ]`.

## Hosted Verify evidence

Verify `45898587594` completed 7/7 success on the exact head:

- repository-hygiene `140178540938`: success
- media-broker `140178612579`: success
- media-broker-pid1 `140178612219`: success
- backend `140178612207`: success
- frontend `140178612214`: success
- productive-routes-real-e2e `140178612220`: success
- unified-access-real-e2e `140178612256`: success

The PID 1 job log records
`pid1_terminal_without_ack_retains_the_mount_and_job_budget ... ok` and
`33 passed; 0 failed; 0 ignored`.

The media-broker job log independently records
`store::tests::a_terminal_job_without_ack_keeps_the_global_reservation ... ok`
and `80 passed; 0 failed; 33 ignored`.

The workflow is outside the diff. The exact-head jobs retain the pinned
`Temurin 21.0.13+9`; this review did not retarget Java.

## Full diff reviewed

- `backend/media-broker/src/store.rs` adds one focused test that follows
  `Allocated -> InputSealed -> Starting -> Terminal` without ACK and proves
  retained usage, `JobLimit` on a second allocation, the retained terminal
  record, and open admission.
- `backend/media-broker/src/dbus.rs` adds one ignored real PID 1 harness test
  that combines the same durable lifecycle with a real first mount that stays
  `Active` and a second derived mount that is `NotLoaded`.
- `pid1_single_job_store` and `reach_terminal_without_ack` only exist inside
  the `#[cfg(test)] mod tests` boundary.
- `sdd/STATUS.md`, WIP `progress.md`, and WIP `meta.md` record this narrow
  evidence and explicitly preserve the remaining gates.

There is no production broker behavior, workflow, Java target, Kotlin,
Angular, migration, HTTP route, dependency, lockfile, or plan checkbox change.

## Architecture review

### Closed state and error domains

`JobState` remains a closed Rust enum:
`Allocated | InputSealed | Starting | Running | Terminating | Terminal |
Quarantined | Unknown`. `JobState::from_wire` is the durable boundary
translator, unknown values become `Unknown`, and restore rejects them
fail-closed. The tested path uses typed states and the existing transition
matrix; it does not compare magic state strings.

`BudgetError::JobLimit`, `StoreError::Budget`, `AdmissionStatus`,
`UnitKind`, `UnitState`, and `SystemdError::NotLoaded` remain closed types.
The systemd adapter translates the external `NoSuchUnit` condition before the
test observes `NotLoaded`. This satisfies the closed-domain-states rule.

### Reservation retention

`BrokerStore::transition` persists each authority-bound CAS transition before
replacing the in-memory record. No transition recalculates or releases
`BudgetUsage`. `BudgetUsage::from_records` counts every durable record,
including `Terminal`, across jobs, mounts, bytes, and inodes; only quarantine
moves byte/inode accounting to its separate bounded pool.

The new store test reaches `Terminal` without invoking `AckOutput`, confirms
the terminal record remains durable, and confirms jobs/bytes remain reserved.
The pre-existing budget test covers the complete terminal reservation,
including mounts and inodes. The second allocation is preflighted against the
retained one-job usage and returns the typed
`StoreError::Budget(BudgetError::JobLimit)` before journal or in-memory
mutation. Admission remains `Open`: exhaustion rejects the attempted job
without corrupting the store.

### Real PID 1 boundary

The PID 1 test opens a one-job durable store, allocates job A, derives its mount
from broker-owned inputs, and starts the real transient `.mount` through the
system bus. It then drives the durable record through
`Allocated -> InputSealed -> Starting -> Terminal` with no ACK and requires:

- typed terminal state;
- retained job and byte usage;
- job A's first mount still `Active`;
- job B's allocation rejected with `JobLimit`;
- job B's derived mount `NotLoaded`.

No `StartTransientUnit` call is made for job B. The test stops the first mount
only during harness cleanup, after all retention assertions. This is correctly
scoped evidence for the terminal-without-ACK residual; it does not claim a
production daemon orchestration path or 4C completion.

### Effective-property scope

This diff does not alter the worker property bag. `ProtectHome`, `CPUQuota`,
and `RestrictAddressFamilies` remain unset. Existing internally derived
hardening and RLIMIT properties remain unchanged, and the client still cannot
supply arbitrary systemd properties.

## Ledger consistency and existing constraints

- STATUS, progress, and meta describe the same narrow terminal-without-ACK
  evidence without claiming `Ready`, HTTP, FD/mmap, restart, or full 4C.
- `plan.md` is outside the diff and `MEDIA-NORMALIZE-003B-4C` remains `[ ]`.
- PR #319 architecture's durable admission, aggregate budget,
  journal-before-memory, closed recovery, and retained-terminal constraints
  remain intact.
- PR #358 architecture's rule that one focused PID 1 boundary is partial
  harness evidence, not 4C closure, remains intact.
- PR #420 architecture established the first-allocation/second-`JobLimit`
  global budget boundary. This cut extends that evidence through `Terminal`
  without ACK while preserving the first mount.
- the applicable backend architecture standard is separation of state/budget
  decisions from the D-Bus infrastructure boundary and typed error
  propagation. Spring/Kotlin controller, DTO, JPA, and transaction rules do
  not apply to this Rust-only test diff.

No new architecture gap was found.

## P0-P3

- P0: none
- P1: none
- P2: none
- P3: none

## Residual `003B-4C` work (not findings)

- retain FD and mmap after seal and prove subsequent mutation cannot change the
  broker-owned snapshot;
- restart and reconcile at every durable transition;
- complete effective socket-family evidence;
- `ProtectHome`, `CPUQuota`, and `RestrictAddressFamilies` remain unset;
- `003B-4B-3`, `003B-4B-4`, aggregate `003B-4B`, `003B-4C`, `003B-4`,
  MEDIA-NORMALIZE-004, TASK-005, and issue #7 remain open;
- no `Ready`, media HTTP, multipart, live provider, secrets, deploy, or
  homologation.

## Conclusion

The exact PR range adds focused store and real PID 1 evidence that a closed
`Terminal` job without `AckOutput` retains its reservation: the first mount
remains `Active`, the second allocation fails with typed `JobLimit`, and the
second mount is `NotLoaded`. Exact-head Verify `45898587594` passed 7/7,
including the required PID 1 result (`33 passed; 0 failed`). The SDD ledger
honestly keeps 4C open, with FD/mmap and restart as the next residuals.
Architecture verdict: APPROVED with no P0-P3. This is not a GitHub approval and
does not close `003B-4C`.
