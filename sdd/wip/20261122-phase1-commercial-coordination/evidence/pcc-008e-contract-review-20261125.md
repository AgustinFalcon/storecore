# PCC-008E atomic in-app handoff contract review — 2026-11-25

## Reviewed scope

- Functional PCC-R10X.
- Technical `PCC-008E exact atomic in-app CAMPAIGN handoff contract`.
- Existing PCC-008D occurrence lease/fence implementation.
- Existing notification domain, ingestion persistence and email projection.
- Global closed-state and object-oriented domain rule.

## First review

Two independent GPT-6.1 Sol reviewers at medium reasoning returned `NO-GO` and shared their findings:

- `handoffAt` was captured before a later blocking delivery advisory lock, so a wait could consume the lease while the old instant still appeared valid;
- the inherited occurrence shape allowed `SKIPPED` only at attempts 0..2 while the handoff correctly needed to skip a still-valid third-attempt lease;
- `NotificationIngestionResult.Recorded` did not prove that the handoff created a new alert and left a race with an alternative delivery for the same episode;
- concurrent replay evidence needed an explicit re-read under the occurrence lock.

## Contract repairs

- Occurrence is locked before evidence classification, and evidence is re-read under that lock.
- Lock order is occurrence, switch, event, definition/rule, RESUME evidence, notification delivery advisory, notification episode advisory; the fresh whole-second handoff instant is captured only after every possible wait.
- Notification ingestion now requires a closed disposition and PCC-008E accepts only `CREATED`; all producers share delivery-then-episode advisory ordering.
- V39 must expand `SKIPPED` plus the persistence decoder to attempts 0..3 while preserving `DEAD` precedence for an already expired third lease during claim.
- Adversarial tests explicitly cover delivery-lock expiry crossing, alternative delivery race, evidence re-read and every third-attempt skip guard.

## Final review

- Architecture/SOLID/closed-types reviewer: `GO contractual`, no P0–P3 findings.
- Concurrency/security/SQL reviewer: `GO contractual`, no P0–P3 findings.
- Both reviewers compared results and agreed that no demonstrated deadlock, atomicity gap, privilege gap or email leakage remains in the corrected contract.

This approval covers the contract only. Implementation, migration, tests and activation remain separate gates. No hosted CI, push, PR or merge is claimed.
