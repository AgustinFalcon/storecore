VERDICT: APPROVED

## Evidence identity

- provider: OpenAI
- model: gpt-5.6-sol-medium
- effort: medium
- lane: architecture
- independent of the security lane. This review did not read
  `sdd/reviews/20261126-sol-pr420-security.md` or any security-lane draft.
- PR: 420 OPEN, `feat(media): attest PID 1 global job budget on the second allocation`
  https://github.com/AgustinFalcon/storecore/pull/420
- branch: `feat/media-broker-4c-global-quota-20261126`
- head SHA: `f63631a062d4c4d986cdd3445a6811d06637f663`
- PR base SHA: `e0b918e7e22f0f53d90d6292da9cbb0fc8bdce26`
- Verify: `45887600304`, attempt 1, event `pull_request`, status `completed`,
  conclusion `success`, headSha
  `f63631a062d4c4d986cdd3445a6811d06637f663`
- diff identity:
  `git diff e0b918e7e22f0f53d90d6292da9cbb0fc8bdce26...f63631a062d4c4d986cdd3445a6811d06637f663`
  is 5 files, +140 / -10. `git diff --check` on that exact range exited 0
  with no output.
- commits in the range:
  `8c6cca200e8d75d669db6b9b38479cffe3d6bd5c` (`feat`) and
  `f63631a062d4c4d986cdd3445a6811d06637f663` (`rustfmt`)
- checkout at review time: HEAD
  `f63631a062d4c4d986cdd3445a6811d06637f663`; `origin/master`
  `c9ceacde4ec273ec7e09c884c31f1fe886058471`. The later master movement
  (PCC-014 PR #421) is not part of this verdict.
- the pre-existing untracked persist review leftovers from PR #365 through
  PR #418 were not staged or modified.
- local cargo was not rerun on this Windows host. The focused Linux/PID 1
  validation is the successful hosted exact-head Verify identified above.
- this file is not a GitHub approval, does not merge the PR, and does not
  close `003B-4C`.

## PR intent and why this cut

`gh pr view 420` reports base `master` at the exact base SHA above and the
expected head/branch. Its body limits the cut to the global `jobs=1` budget:
the first allocation is admitted, the second fails closed with
`BudgetError::JobLimit`, and PID 1 has no second `.mount`. It explicitly
withholds closure of `003B-4C`, `Ready`, sockets, terminals without ACK, and
HTTP media.

The canonical sources agree:

- `sdd/STATUS.md` says this cut attests global quota and leaves
  `003B-4C`, terminal-without-ACK behavior, socket-family attestations,
  `Ready`, and media HTTP open.
- the technical spec's `003B-4C` paragraph still requires the complete real
  Linux harness: SELF_TEST/NORMALIZE, job isolation, per-job and global quota,
  terminal records without ACK, retained FD/mmap after seal, OOM/timeout,
  cgroup termination, substitution rejection, and restart at every durable
  transition.
- ADR-001 requires multiple allocations for the global budget and does not
  allow a single per-job quota test to stand in for that evidence.
- `3-tasks/plan.md` keeps `MEDIA-NORMALIZE-003B-4C` at `[ ]`.
- only `003B-4A+4B+4C` may complete `003B-4`; this cut does not add HTTP,
  multipart, a live provider, secrets, deploy, or homologation.

## Hosted Verify evidence

`gh pr checks 420` and `gh run view 45887600304` independently report all
seven jobs as `completed` / `success` on the exact head:

- repository-hygiene `140142101433`: success
- media-broker `140142179595`: success
- media-broker-pid1 `140142179687`: success
- backend `140142179679`: success
- frontend `140142179754`: success
- productive-routes-real-e2e `140142179691`: success
- unified-access-real-e2e `140142179568`: success

The `media-broker-pid1` log records
`pid1_global_job_budget_rejects_second_allocation ... ok` and
`32 passed; 0 failed; 0 ignored` for the PID 1 binary. The `media-broker`
log records
`store::tests::a_second_allocation_is_rejected_when_the_global_job_cap_is_one ... ok`
and `79 passed; 0 failed; 32 ignored`.

`.github/workflows/verify.yml` is not in the diff. On this head,
`media-broker-pid1` remains `timeout-minutes: 40`; Temurin remains
`21.0.13+9.0.LTS`, `check-latest: false`, with the unchanged
`Pin Temurin 21.0.13+9` step. This review did not retarget Java.

## Full diff reviewed

The full exact three-dot diff contains:

- `backend/media-broker/src/store.rs`: one focused store test for a global
  one-job cap.
- `backend/media-broker/src/dbus.rs`: one ignored real PID 1 harness test
  joining `BrokerStore` admission evidence to a real first transient mount
  and a `NotLoaded` attest for the rejected job's derived mount.
- `sdd/STATUS.md`: honest implementation banner; no gate closure.
- WIP `4-implementation/progress.md`: records the cut and its residuals.
- WIP `meta.md`: records global-quota evidence without claiming `Ready`.

There is no workflow, plan, production broker behavior, Kotlin, Angular,
migration, HTTP route, Java pin, timeout, fixture, dependency, or lockfile
change.

## Implementation review

### Closed types and boundaries

The relevant finite states and failures remain closed Rust enums:
`BudgetError::JobLimit`, `StoreError::Budget`, `AdmissionStatus`, and
`JobState`. `JobState::from_wire` is the single durable-state translator;
unknown values become `JobState::Unknown`, and restore rejects them
fail-closed. The test compares typed values, not magic state strings.

Systemd property names and the D-Bus `NoSuchUnit` name remain adapter wire
tokens. `classify_dbus_name` translates `NoSuchUnit` to the typed
`SystemdError::NotLoaded`; other D-Bus names remain `Unavailable`.

### Store admission and durability

`BrokerStore::allocate` first requires `AdmissionStatus::Open`, builds and
validates the typed `JobRecord`, rejects duplicate identity, and computes
candidate aggregate usage through `BudgetUsage::admit`. It persists the
record before inserting it into the in-memory map and before replacing the
current usage. A journal failure blocks admission.

With `BudgetLimits::create(1, 1, ...)`, the first allocation increments the
candidate job count to one and is persisted. The second candidate increments
to two, so `BudgetUsage::verify` returns `BudgetError::JobLimit` before any
journal or in-memory mutation. `StoreError::Budget(BudgetError::JobLimit)`
preserves the closed error chain.

The new store test confirms the first record is retained, usage stays at one,
the exact second error is `JobLimit`, and admission remains `Open`. Budget
exhaustion rejects only that allocation; it does not corrupt or globally latch
an otherwise healthy store.

### PID 1 harness

The harness creates the dedicated journal directory and explicitly sets mode
`0700`; `Journal::open` additionally rejects group/other permissions, wrong
owner, a non-directory, or a symlink-following open.

Job A uses `[0x22; 16]`. After its durable store allocation, the harness
derives its mount from broker-owned inputs, calls the real system bus
`StartTransientUnit`, and requires `UnitState::Active`.

Job B uses `[0x23; 16]`. Its second `BrokerStore::allocate` returns the exact
typed job-limit error. The harness does not invoke `StartTransientUnit` for
job B; it derives only the identity needed for attestation and requires the
real PID 1 lookup to return `SystemdError::NotLoaded`. The first durable
record and one-job usage remain present. The first real mount is then stopped.

This is correctly scoped global-admission evidence. It does not claim a
production daemon orchestration path or broader completion of `003B-4C`.

### Worker properties

The worker property bag remains unchanged by this diff. `ProtectHome`,
`CPUQuota`, and `RestrictAddressFamilies` remain unset. Existing internally
derived RLIMIT, cgroup, namespace, and hardening properties remain as before;
the client still cannot provide arbitrary systemd properties.

## Ledger and SDD consistency

- STATUS accurately says global `jobs=1` admits the first allocation, rejects
  the second with `JobLimit`, and does not start the second `.mount`.
- progress records the same evidence and explicitly leaves
  `003B-4C`, terminals without ACK, socket families, `Ready`, and HTTP open.
- meta adds the same narrow attestation and does not claim completion.
- `plan.md` is outside the diff and `MEDIA-NORMALIZE-003B-4C` remains `[ ]`.
- no Ready/HTTP checkbox was checked, no Java target changed, and no later
  master commit was included in the reviewed range.

## Standards and existing review constraints

Applied architecture constraints from the existing media-broker reviews:

- PR #319 architecture: durable admission, aggregate budgets, journal-before-
  memory mutation, and closed recovery/admission states remain authoritative.
- PR #346 architecture: a focused effective quota attest is evidence for one
  residual only and does not close `003B-4C` or introduce `CPUQuota`.
- PR #358 and PR #416 architecture: a PID 1 attest of one boundary remains
  inside the harness; canonical plan closure, `Ready`, and HTTP stay separate.
- `.cursor/rules/closed-domain-states.mdc`: finite states and errors are closed
  types, with unknown durable state failing closed at one boundary.
- the applicable parts of `my-backend-standards` are separation of domain
  decisions from infrastructure and typed error propagation. Spring/Kotlin
  package, controller, DTO, JPA, and transaction rules do not apply to this
  Rust-only diff. The store owns admission/durability; D-Bus remains the
  infrastructure adapter.

No new architecture gap was found.

## P0-P3

- P0: none
- P1: none
- P2: none
- P3: none

## Residual `003B-4C` work (not findings)

- terminals without ACK and retention/reconciliation semantics in the real
  harness
- FD/mmap retained after seal and proof that later source mutation cannot
  change the broker snapshot
- restart at every durable transition
- complete socket-family effective attestation
- `ProtectHome`, `CPUQuota`, and `RestrictAddressFamilies` remain unset
- aggregate `003B-4B`, `003B-4C`, `003B-4`, MEDIA-NORMALIZE-004, TASK-005,
  and issue #7 remain open
- no `Ready`, media HTTP, multipart, provider live, secrets, deploy, or
  homologation

## Conclusion

The exact PR range implements and attests the narrow global one-job budget
cut without overstating completion. The store rejects the second allocation
with the closed `JobLimit` error before persistence or in-memory mutation,
retains the first durable record, keeps admission open, and the real PID 1
harness proves the first derived mount is active while the rejected second
derived mount is `NotLoaded`. Exact-head Verify `45887600304` passed 7/7,
including the required PID 1 and store tests. `003B-4C`, `Ready`, and HTTP
remain open. Architecture verdict: APPROVED with no P0-P3.
