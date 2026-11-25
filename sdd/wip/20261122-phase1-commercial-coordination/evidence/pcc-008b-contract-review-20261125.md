# PCC-008B reminder-switch contract review — 2026-11-25

## Scope

Contract-only gate for the temporary, audited commercial-calendar reminder switch. This evidence does not approve its migration, writer, HTTP implementation, worker, runner or activation.

Base implementation head: `056ba8da34dd7c2d8a860f96ce348a3eaeddca92`.

## Closed contract

- Added functional requirements `PCC-R10O` through `PCC-R10S`.
- Added the exact PCC-008B technical contract for operations, configured/effective state, receipts, audit, HTTP routes, capability admission, expiry and global command identity.
- Preserved readiness `UNAVAILABLE` and explicitly excluded every scheduler, timer, claim, notification effect and external transport.
- Required closed domain types and one boundary translator; no raw-string state decisions are authorized.

## Independent review

Two GPT-6.1 Sol reviewers at medium reasoning independently returned an initial `NO-GO` with the same two P2 findings:

1. exact replay was not explicitly ordered before relative expiry and current capability/revision guards;
2. receipt and audit wire DTOs were not exact despite the stated contract gate.

The contract was corrected to:

- authenticate/authorize and validate canonical structure, then resolve binding/exact replay before variable guards for a new UUID;
- define exact diagnostic, historical snapshot, receipt and audit-page DTOs plus generic non-leaking collision/404 behavior;
- add adversarial replay cases after expiry, state/revision changes and capability/kill changes.

Both reviewers then returned `APPROVE` with no P0–P3 findings. Their approval is limited to the corrected documentary contract. Migration, writer, adversarial tests, hosted CI and activation retain independent gates.

## Local documentary checks

- `git diff --check`: pass.
- No production test was claimed for this contract-only change.
