VERDICT: APPROVED

## Evidence identity

- provider: OpenAI
- model: gpt-5.6-sol-medium
- effort: medium
- lane: architecture
- independent of the security lane (this review did not read the PR #436 security-lane file).
- PR: #436 OPEN, `feat(media): attest PID 1 restart after InputSealed with absent units`
- URL: https://github.com/AgustinFalcon/storecore/pull/436
- branch: `feat/media-broker-4c-restart-inputsealed-20261127`
- base branch: `master`
- head SHA: `4038b5cd33bad11a60be587395b9c1732c28c971`
- base SHA: `1434f49b2028f189e4fbbf1d46a284910b53c39a`
- exact range:
  `1434f49b2028f189e4fbbf1d46a284910b53c39a...4038b5cd33bad11a60be587395b9c1732c28c971`
- diff identity: 5 files, 129 insertions, 4 deletions; the full three-dot
  diff was read.
- checkout HEAD was the exact PR head, the branch was unchanged, and the PR
  reports the expected exact base and head SHAs.
- `git diff --check` on the exact range exited 0 with no output.
- this file is not a GitHub approval, does not merge or retarget PR #436,
  does not retarget Java, and does not close or check off `003B-4C`,
  `003B-4B-3`, `003B-4B-4`, Ready, HTTP, or TASK-005.

## PR intent and SDD why

`gh pr view 436` reports the expected OPEN PR and a narrow evidence cut:
after persisting `InputSealed`, reopening the journal must hold admission in
`RecoveryPending`; PID 1 must report neither derived unit loaded; and a clean
absent inventory must reopen admission while preserving the sealed job.

ADR-001 requires restart recovery at every durable transition. Its `003B-4C`
contract requires real Linux harness evidence for restart at each durable
state. The canonical plan still has `MEDIA-NORMALIZE-003B-4C` as `[ ]`.

STATUS remains `En implementación` and names restart after `Starting` as the
next cut. Progress contains both the new InputSealed heading and PR #433
Allocated close-out. Meta records Allocated as attested and InputSealed as in
implementation. All three preserve `Starting` and later transitions,
socket-family evidence, `Ready`, and media HTTP as residuals.

## Hosted Verify and focused validations

Verify run `45936651108` is a completed `pull_request` run with conclusion
`success` on exact head
`4038b5cd33bad11a60be587395b9c1732c28c971`. Its final 7 jobs succeeded:

- repository-hygiene `140310865440`
- media-broker `140310866425`
- media-broker-pid1 `140310865795`
- backend `140310864286`
- frontend `140310914539`
- productive-routes-real-e2e `140310892613`
- unified-access-real-e2e `140310917205`

The first backend attempt, job `140301351646`, failed and is not counted as a
pass. Its log records Maven Central HTTP 429 while resolving
`surefire-junit-platform:3.5.4`. The rerun backend job `140310864286`
completed successfully.

The exact `media-broker-pid1` log records
`pid1_input_sealed_job_survives_restart_with_absent_units ... ok`; the test
uses JobId `[0x2a; 16]`. The exact `media-broker` log records
`input_sealed_job_survives_restart_with_absent_runtime ... ok`. The
exact-range whitespace check also passed.

## Architecture review

- The PID 1 test durably creates `Allocated`, transitions it to
  `InputSealed`, drops the store, and reopens the journal. The reopened store
  is `RecoveryPending`; allocation of JobId `[0x2b; 16]` fails with
  `AdmissionClosed` before reconciliation.
- `TransientUnits::derive` reconstructs the exact `.mount` and worker
  identities from the durable JobId and internal configuration. PID 1 reports
  both as `NotLoaded`.
- `Pid1AbsentUnits` translates only the exact pair
  `(Mount NotLoaded, Worker NotLoaded)` into an empty inventory. Every other
  pair is `Unavailable`, while `terminate` is always `Unavailable`. Partial or
  unreadable runtime state therefore cannot be treated as clean absence.
- Production reconciliation recognizes only
  `Allocated | InputSealed` with `Absent` as consistent among these
  non-running pre-start states. The clean path records no mismatch, performs
  no termination or quarantine, reopens admission, and preserves the durable
  `InputSealed` record.
- The independent fake-adapter test proves the same
  `RecoveryPending` to `Clean`/open behavior and full sealed-record
  preservation without relying on the PID 1 integration.
- `src/lib.rs` still declares `#![forbid(unsafe_code)]`. The exact diff changes
  only `dbus.rs`, `reconcile.rs`, STATUS, progress, and meta. It changes no
  `Cargo.toml`, Java, HTTP, Ready, migration, or plan checkbox, and performs
  no Java retarget.
- The rebase preserves the intended narrow cut. Restart after `Starting` and
  later durable transitions, sockets, `Ready`, and HTTP remain residuals;
  `003B-4C` remains open.

## P0-P3

- P0: none
- P1: none
- P2: none
- P3: none

## Conclusion

The rebased exact head independently demonstrates that an `InputSealed` job
survives broker restart with both derived units absent: admission stays closed
until reconciliation, absence is interpreted fail-closed, and clean
reconciliation reopens admission without termination, quarantine, or state
loss. The SDD accurately retains the remaining gates. Architecture verdict:
APPROVED with no P0-P3.
