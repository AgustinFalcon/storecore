VERDICT: APPROVED

## Evidence identity

- provider: OpenAI
- model: gpt-5.6-sol-medium
- effort: medium
- lane: architecture
- independent of the security lane (this review did not read the PR #433
  security-lane file).
- PR: #433 OPEN, `feat(media): attest PID 1 restart after Allocated with absent units`
- URL: https://github.com/AgustinFalcon/storecore/pull/433
- branch: `feat/media-broker-4c-restart-allocated-20261126`
- base branch: `master`
- head SHA: `f54c78857a6c1dd8b2a39191872338bd5b383a26`
- base SHA: `38cd39a48e840f2ad457aae8ac3a9ee4d892c59b`
- exact range:
  `38cd39a48e840f2ad457aae8ac3a9ee4d892c59b...f54c78857a6c1dd8b2a39191872338bd5b383a26`
- diff identity: 5 files, 141 insertions, 9 deletions; the full three-dot
  diff was read.
- commit: `f54c78857a6c1dd8b2a39191872338bd5b383a26`.
- checkout HEAD was the exact PR head; fetched `origin/master` was the exact
  base SHA.
- `git diff --check` on the exact range exited 0 with no output.
- this file is not a GitHub approval, does not merge or retarget PR #433,
  does not retarget Java, and does not close or check off `003B-4C`.

## PR intent and SDD why

`gh pr view 433` reports the expected OPEN PR and a narrow recovery evidence
cut: after persisting `Allocated`, reopen the journal, prove admission remains
closed during `RecoveryPending`, prove PID 1 has neither the derived `.mount`
nor worker loaded, then reconcile an exact absent inventory and preserve the
durable job while reopening admission.

ADR-001 requires durable, monotonic broker state and restart reconciliation
before admission. Its 4C contract requires restart evidence at every durable
transition. The technical spec repeats that aggregate requirement. Therefore
this PR can approve only the `Allocated` transition case, not the aggregate
restart gate.

The canonical plan still has `MEDIA-NORMALIZE-003B-4C` as `[ ]`. STATUS,
progress, and meta accurately name `InputSealed` and all remaining durable
transitions as residuals. Socket-family attest, capability `Ready`, and media
HTTP also remain outside this cut.

## Hosted Verify and focused validations

Verify run `45923481080` is a completed `pull_request` run with conclusion
`success` on exact head
`f54c78857a6c1dd8b2a39191872338bd5b383a26`. All 7 jobs succeeded:

- repository-hygiene `140259369812`
- media-broker `140259427270`
- media-broker-pid1 `140259427443`
- backend `140259427224`
- frontend `140259427260`
- productive-routes-real-e2e `140259427234`
- unified-access-real-e2e `140259427302`

The exact `media-broker-pid1` log records
`pid1_allocated_job_survives_restart_with_absent_units ... ok`; its integration
target completed with 35 passed and 0 failed. The exact `media-broker` log
records `allocated_job_survives_restart_with_absent_runtime ... ok`; the
library target completed with 81 passed and 0 failed. The exact-range
whitespace check also passed.

## Architecture review

- The test first creates and durably persists an `Allocated` record, then drops
  the original store. Reopening the same journal is the restart boundary; it
  reconstructs the durable reservation and enters `RecoveryPending`.
- Before any runtime observation or reconciliation, a second allocation fails
  with `StoreError::AdmissionClosed`. This proves recovery precedes admission,
  rather than merely observing the final open state.
- Unit identities are derived internally from the persisted `JobId` and the
  approved runtime. Direct PID 1 attestations prove both the `.mount` and the
  worker are `NotLoaded`; the client does not supply paths, names, commands, or
  systemd properties.
- `Pid1AbsentUnits` maps only the exact pair of `NotLoaded` results to an empty
  inventory. Any other pair fails `Unavailable`, and `terminate` always refuses
  with `AdapterError::Unavailable`. Thus a passing reconciliation cannot be
  produced by a hidden stop/kill side effect.
- The production reconciliation rule already treats
  `Allocated + RuntimeState::Absent` as consistent. The clean report therefore
  performs no durable transition or termination, retains the job as
  `Allocated`, and reopens admission only through `finish_reconciliation`.
- The regular fake-adapter regression independently proves journal reopen,
  `RecoveryPending`, clean absent-runtime reconciliation, admission reopening,
  and equality of the restored `Allocated` record.
- The change does not claim restart behavior after `InputSealed`, `Starting`,
  `Running`, `Terminating`, `Terminal`, `Quarantined`, or unknown/corrupt
  states. It adds no socket-family attest, `Ready`, HTTP, migration,
  Kotlin/Angular boundary, Java retarget, or production recovery adapter.
- The documentation is honest about those residuals and leaves
  `MEDIA-NORMALIZE-003B-4C` unchecked.

This is sufficient evidence for the single `Allocated` restart slice. It is
not sufficient evidence for restart at every durable transition or for closing
4C, and the PR does not present it as such.

## P0-P3

- P0: none
- P1: none
- P2: none
- P3: none

## Conclusion

PR #433 proves on the exact hosted head that a durably `Allocated` job reopens
in `RecoveryPending`, rejects admission before reconciliation, has no loaded
PID 1 mount or worker, and survives a clean absent-inventory reconciliation
without state change. Admission reopens only after that clean reconciliation.
The remaining durable transitions, socket-family attest, `Ready`, and media
HTTP remain explicitly open, so `003B-4C` must not be checked off.
Architecture verdict: APPROVED with no P0-P3.
