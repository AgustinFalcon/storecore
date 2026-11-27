VERDICT: APPROVED

## Evidence identity

- provider: xAI
- model: grok-4.7-medium-fast
- effort: medium
- lane: security
- authorized substitute after gpt-5.6-sol-medium quota
- independent of the architecture lane (this review did not read the PR #451 architecture-lane file).
- PR: #451 OPEN, `feat(media): attest PID 1 restart with expected Active units terminates to Terminal`
- URL: https://github.com/AgustinFalcon/storecore/pull/451
- branch: `feat/media-broker-4c-restart-active-inventory-20261127`
- base branch: `master`
- head SHA: `207f7493eb5f1df79580d69b5216f8ca9bb72572`
- base SHA: `46454e21ebb0d5c8b5d9ef328d8cfcfda46cba4a`
- exact range:
  `46454e21ebb0d5c8b5d9ef328d8cfcfda46cba4a...207f7493eb5f1df79580d69b5216f8ca9bb72572`
- diff identity: 4 files, +166/-3
- files: `backend/media-broker/src/dbus.rs`, `sdd/STATUS.md`, WIP
  `progress.md`, WIP `meta.md`
- `git diff --check` on the exact three-dot range: clean
- local `HEAD` confirmed `207f7493eb5f1df79580d69b5216f8ca9bb72572` on
  `feat/media-broker-4c-restart-active-inventory-20261127`; the branch was left in place
- Verify: `46063548747`, event `pull_request`, `completed` / `success`,
  headSha `207f7493eb5f1df79580d69b5216f8ca9bb72572`
- this file is not a GitHub approval and does not merge or close `003B-4C`

## Hosted Verify

All 7 jobs completed successfully on the exact head:

- repository-hygiene `140723310343`
- media-broker `140723401949`
- media-broker-pid1 `140723401917`
- backend `140723402019`
- frontend `140723401919`
- productive-routes-real-e2e `140723401967`
- unified-access-real-e2e `140723401988`

Focused evidence:

- `media-broker` passed 87 regular tests and 0 failed, with 42 ignored.
  The new PID 1 regression is `#[ignore]` in that suite. The job log shows
  the lockfile format/lint suite completed with that result.
- `media-broker-pid1` passed
  `dbus::tests::pid1_running_job_with_active_units_is_terminated_after_restart
  ... ok`. The test source binds JobId `[0x36; 16]`. The PID 1 suite reported
  42 passed and 0 failed.
- `gh run view 46063548747 --json conclusion,headSha,event,status` is
  `success` / `207f7493eb5f1df79580d69b5216f8ca9bb72572` / `pull_request` /
  `completed`. The run and every listed job concluded `success`. No cancelled
  or skipped job was counted as passing. A prior candidate on another head
  was not treated as this run.

## Why this cut

The PR title/body, STATUS next-cut statement (unexpected Active inventory),
progress expected-Active heading, meta, ADR-001 terminate-verified runtime,
and plan agree on the narrow property under review. Reopening a durable
`Running` job whose derived `.mount` and worker are both Active must stay
`RecoveryPending` until reconcile. Reconcile may move that job to `Terminal`
and reopen admission only after both units stop to `Inactive` or `Failed`.
Any other observation or an unverified stop stays fail-closed.

The plan still records `MEDIA-NORMALIZE-003B-4C` as `[ ]`. The next cut is
unexpected Active inventory; this PR does not attest socket families, `Ready`,
HTTP, or completion of the aggregate gates.

## Security review

- The PID 1 regression reaches durable `Running` for JobId `[0x36; 16]`,
  starts the derived units, drops the store, and reopens it. On that reopen,
  admission is `RecoveryPending`. `BrokerStore::allocate` returns
  `StoreError::AdmissionClosed` when admission is not `Open`, before
  `JobRecord::allocate`, budget admission, or journal persist. The attested
  call rejects `[0x37; 16]` before `pid1_assert_expected_active_terminated`
  enumerates, stops, or reconciles inventory.
- The attested job identity is fixed as `[0x36; 16]`.
  `TransientUnits::derive` builds `Where` under
  `/run/storecore_media/jobs` from that `JobId`, and `DerivedUnits::derive`
  names the `.mount` and worker `.service` from that identity. The diff adds
  no client-supplied command, `ExecStart`, path, `Where`, unit name, or D-Bus
  method. Start, attest, and stop go through `ZbusSystemd` on the allowlisted
  Manager interface (`StartTransientUnit`, `GetUnit`/`ActiveState`,
  `StopUnit`).
- `Pid1ExpectedActive::enumerate` returns inventory `Active` only for the
  dual `UnitState::Active` pair. Every other pair, including a D-Bus
  `Unknown` state, is `AdapterError::Unavailable`. `reconcile` maps that
  error to `fail_closed` with `ReconciliationUnavailable` and does not open
  admission.
- `Pid1ExpectedActive::terminate` returns `Unavailable` for any other
  `JobId` and does not stop in that case. For the attested id it stops the
  derived worker and then the derived mount. It returns
  `RuntimeState::Terminal` only when both `stop` results are
  `Inactive | Failed`. Any other state, or a stop error, is `Unavailable`.
- `terminate_verified` accepts only `Ok(RuntimeState::Terminal)`. On the
  `Running` plus observed `Active` arm, `reconcile` calls that check before
  the durable transition to `JobState::Terminal`. A failed check returns
  `TerminationUnverified` through `fail_closed` and does not transition or
  finish reconciliation. `finish_reconciliation` becomes `Open`, and the
  report `Clean`, only when there is no mismatch and no `Quarantined`
  record. The PID 1 assertion records `terminated == 1`, `transitioned == 1`,
  `Clean`, `Open`, `Terminal`, and both units `NotLoaded` afterward.
- `JobState::expects_runtime` remains `Starting | Running | Terminating`.
  `Allocated` plus `Active` is not this cut: `reconcile_non_running` would
  treat that pair as inconsistent, and this PR does not attest it.
- Unexpected Active inventory, socket-family attestation, `Ready`, and HTTP
  remain unattested. `ProtectHome`, `RestrictAddressFamilies`, and `CPUQuota`
  remain explicitly out of scope.
- The full three-dot diff adds one ignored PID 1 regression, its
  expected-Active adapter, and SDD status updates. It adds no secret or
  credential, HTTP route, capability `Ready`, Java pin/retarget, production
  execution surface, deploy, tag, or publish behavior.
- `backend/media-broker/src/lib.rs` still has `#![forbid(unsafe_code)]`. The
  added code introduces no `unsafe`.
- STATUS, progress, meta, and plan retain `003B-4B-3`, `003B-4B-4`,
  `003B-4C`, `003B-4`, TASK-005, issue #7, `Ready`, and media HTTP as open or
  out of scope. This review does not check those boxes.

## Open residuals

- unexpected Active inventory and the remaining `003B-4C` harness
- socket-family attestation and `RestrictAddressFamilies`
- remaining effective hardening gaps including `CPUQuota` and `ProtectHome`
- `003B-4B-3`, `003B-4B-4`, `003B-4C`, `003B-4`, TASK-005, and `Ready`
- media HTTP, multipart, provider live, secrets, deploy, tag, and publish

## Findings

P0: none.

P1: none.

P2: none.

P3: none.

## Verdict

APPROVED for exact head `207f7493eb5f1df79580d69b5216f8ca9bb72572`
over base `46454e21ebb0d5c8b5d9ef328d8cfcfda46cba4a`. Verify
`46063548747` is independently confirmed final 7/7 on that head, including
the PID 1 expected-Active restart regression. This is not a GitHub approval
and does not merge or close `003B-4C`; unexpected Active inventory, sockets,
`Ready`, and HTTP remain unattested.
