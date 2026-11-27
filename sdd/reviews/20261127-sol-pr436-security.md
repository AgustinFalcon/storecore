VERDICT: APPROVED

## Evidence identity

- provider: OpenAI
- model: gpt-5.6-sol-medium
- effort: medium
- lane: security
- independent of the architecture lane (this review did not read the PR #436
  architecture-lane file).
- PR: #436 OPEN, `feat(media): attest PID 1 restart after InputSealed with absent units`
- URL: https://github.com/AgustinFalcon/storecore/pull/436
- branch: `feat/media-broker-4c-restart-inputsealed-20261127`
- base branch: `master`
- head SHA: `4038b5cd33bad11a60be587395b9c1732c28c971`
- base SHA: `1434f49b2028f189e4fbbf1d46a284910b53c39a`
- exact range:
  `1434f49b2028f189e4fbbf1d46a284910b53c39a...4038b5cd33bad11a60be587395b9c1732c28c971`
- diff identity: 5 files, +129/-4
- files: `backend/media-broker/src/dbus.rs`,
  `backend/media-broker/src/reconcile.rs`, `sdd/STATUS.md`, WIP
  `progress.md`, WIP `meta.md`
- `git diff --check` on the exact three-dot range: clean
- Verify: `45936651108`, event `pull_request`, `completed` / `success`,
  headSha `4038b5cd33bad11a60be587395b9c1732c28c971`
- this file is not a GitHub approval and does not merge or close `003B-4C`

## Hosted Verify

All 7 jobs completed successfully on the exact head:

- repository-hygiene `140310865440`
- media-broker `140310866425`
- media-broker-pid1 `140310865795`
- backend `140310864286`
- frontend `140310914539`
- productive-routes-real-e2e `140310892613`
- unified-access-real-e2e `140310917205`

Focused evidence:

- `media-broker` passed 82 regular tests, including
  `reconcile::tests::input_sealed_job_survives_restart_with_absent_runtime
  ... ok`; 0 failed. Format, clippy, dependency-license, CycloneDX SBOM, and
  HIGH/CRITICAL CVE gates also completed successfully with the lockfile.
- `media-broker-pid1` passed
  `dbus::tests::pid1_input_sealed_job_survives_restart_with_absent_units ...
  ok`; its PID 1 suite reported 36 passed and 0 failed.
- Attempt 1 was not counted as a pass: backend job `140301351646` failed while
  Maven Central returned HTTP 429 resolving
  `surefire-junit-platform:3.5.4`. The failed job was rerun on the unchanged
  exact head; final backend job `140310864286` completed successfully.
- The final run state and all seven listed final jobs concluded `success`; the
  failed first backend attempt is retained as infrastructure-failure evidence,
  not relabeled as passing.

## Why this cut

The PR title/body, STATUS next-cut statement, progress InputSealed restart
heading, meta, ADR-001 restart-before-admission and fail-closed mismatch
contract, and plan agree on the narrow property under review. Reopening an
`InputSealed` job must remain `RecoveryPending`; admission may reopen only
after exact PID 1 evidence says both derived units are absent.

The plan still records `MEDIA-NORMALIZE-003B-4C` as `[ ]`. The next cut is
restart after `Starting`; this PR does not attest later durable states, socket
families, `Ready`, HTTP, or completion of the aggregate gates.

## Security review

- The PID 1 regression reaches durable `InputSealed`, drops and reopens the
  store, proves `RecoveryPending`, and rejects allocation of `[0x2b; 16]` with
  `AdmissionClosed` before inventory reconciliation. No inventory effect can
  occur before this admission check.
- The attested job identity is fixed as `[0x2a; 16]`. `TransientUnits::derive`
  derives the exact `.mount`, worker unit, and `Where` internally from that
  `JobId` plus root-owned configuration. The diff adds no client-supplied
  command, `ExecStart`, path, unit name, or D-Bus property.
- The harness directly attests both exact derived units as `NotLoaded`.
  `Pid1AbsentUnits::enumerate` returns an empty inventory only for the dual
  `NotLoaded` tuple; every other tuple is `Unavailable`. Its `terminate`
  implementation always returns `Unavailable`, so a clean report cannot be
  manufactured by a hidden termination side effect.
- `JobState::InputSealed` does not satisfy `expects_runtime`; an absent runtime
  is therefore consistent and preserves the sealed record while a clean
  reconciliation reopens admission. `Starting`, `Running`, and `Terminating`
  remain the only runtime-expected states.
- The existing mismatch path is unchanged. A non-running record observed
  `Active` first persists intervention, requires verified termination, and
  quarantines; termination failure remains fail-closed. The PR does not weaken
  `Pid1AbsentUnits` or the broader mismatch handling.
- The full three-dot diff adds only two tests and narrow SDD status updates. It
  adds no secret or credential, HTTP route, multipart/provider wiring,
  capability `Ready`, Java pin/retarget, production D-Bus property surface, or
  deploy/publish behavior.
- `backend/media-broker/src/lib.rs` still has
  `#![forbid(unsafe_code)]`. No unsafe production code was introduced.
- STATUS, progress, and meta retain `Starting` and later restart states,
  socket-family attestation, `ProtectHome`, `RestrictAddressFamilies`,
  `CPUQuota`, `003B-4B-3`, `003B-4B-4`, `003B-4C`, `003B-4`, TASK-005,
  issue #7, `Ready`, and media HTTP as open or out of scope.

## Open residuals

- restart/reconciliation after `Starting`, `Running`, `Terminating`, and the
  remaining durable states
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

APPROVED for exact head `4038b5cd33bad11a60be587395b9c1732c28c971`
over base `1434f49b2028f189e4fbbf1d46a284910b53c39a`. Verify
`45936651108` is independently confirmed final 7/7 on that head, including
both the unit-level and PID 1 InputSealed restart regressions. This is not a
GitHub approval and does not merge or close `003B-4C`; `Starting` onward,
sockets, `Ready`, and HTTP remain unattested.
