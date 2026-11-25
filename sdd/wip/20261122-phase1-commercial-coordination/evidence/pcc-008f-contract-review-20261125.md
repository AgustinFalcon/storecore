# PCC-008F local activation and readiness contract review — 2026-11-25

## Reviewed scope

- Functional PCC-R10Y.
- Technical `PCC-008F exact local activation and readiness contract`.
- Existing PCC-008C lifecycle, PCC-008D claim/fence and PCC-008E atomic handoff implementations.
- Global closed-state and object-oriented domain rule.

## Initial independent findings

Two independent GPT-6.1 Sol reviewers at medium reasoning returned `NO-GO` on the first draft and shared their findings:

- a `CalendarSystemCycleResult.Completed` with a non-zero per-candidate corruption count could still proceed to occurrence claim even though functional lifecycle corruption had to stop the tick;
- claim progress originally omitted occurrences terminalized as skipped or dead before leasing;
- an infrastructure exception or commit-response loss made it impossible for the runner to claim exact persisted progress from delegates that never returned.

## Contract repairs

- Both selection corruption and a completed lifecycle cycle with non-zero corruption now return `CORRUPT_LIFECYCLE` before any claim.
- Claim counters enforce `selected = skipped + dead + leased`; handoff counters are separately bounded by leased records.
- Progress contains only confirmed delegate results that returned to the runner.
- `INFRASTRUCTURE_FAILURE` carries a closed failure stage and explicitly marks that in-flight stage uncertain; it never invents a zero effect after possible commit-response loss.
- Corrupt and failure results retain confirmed lower-bound progress, while completion requires every exact counter equation.

## Final review result

- GPT-6.1 Sol architecture/domain review, medium reasoning: `GO`, no P0–P3 findings.
- GPT-6.1 Sol Spring/PostgreSQL/concurrency review, medium reasoning: `GO`, no P0–P3 findings.

The reviewers compared the repaired counter, corruption and uncertainty semantics. They agreed that exact-property default-off activation, fixed-delay execution, JVM-local exclusion, stable process owner, database fencing, expiry recovery and readiness independent of switch/capability/health are contractually sound.

This approval covers the PCC-008F contract only. Implementation, adversarial tests, local gates and explicit activation evidence remain separately gated. No hosted CI, push, PR or merge is claimed.
