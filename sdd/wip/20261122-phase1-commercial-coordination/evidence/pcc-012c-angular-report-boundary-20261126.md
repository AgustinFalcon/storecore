# PCC-012C — Angular report boundary evidence

Date: 2026-11-26

## Scope closed

- The Angular domain owns closed types with one `fromWire` boundary and `Unknown` for report availability, evidence, finite metric values, BlackStore state and UI load state. No report domain file imports Angular.
- `ReportValue` cannot construct available nulls, mismatched unavailable reasons or unknown reasons. Corruption is represented as the closed per-metric `Unknown` case; one corrupt metric does not erase valid siblings.
- The wire mapper validates the exact root contract and authoritative period globally. It preserves canonical lossless strings for `Long` values and unbounded scale-two ARS amounts.
- Supported metrics accept only `AVAILABLE|UNAVAILABLE`; fixed unsupported metrics accept only their exact `NOT_AVAILABLE` reason. HTTP evidence must be `CURRENT`, correlate with the outer period and use its exact source/time basis.
- Kotlin domain invariants are repeated at the untrusted browser boundary: aggregate equations, checked `Long` partitions, exact bounded collection cardinality, canonical order, unique identities, inventory event/channel compatibility, stock aggregate proof and nested activity variants.
- UTC instants and local dates are validated without JavaScript date normalization. Canonical text follows the backend ASCII-edge rule. Opaque catalog tokens admit 64 characters and reject 65.
- The pure URL boundary rejects duplicate, extra, noncanonical and out-of-range dates. The Angular adapter alone translates `ParamMap` and `HttpParams`.
- `ChannelReportHttpRepository` calls the authenticated relative endpoint, maps the explicit envelope and rejects a response whose period does not correlate with the request. The repository is registered through an injection token.

## UB-mode cycle and review repairs

The first behavior-level regression did not compile because the closed `ReportValue.unknown()` case did not exist. Production was then implemented to the smallest boundary slice. Two GPT-6.1 Sol reviews found and drove repairs for framework leakage into the domain, illegal `ReportValue` factories, an artificial 12-digit money limit, whole-report corruption, collection/aggregate contradictions, illegal inventory pairs, stale evidence, permissive nested activity, normalized invalid dates, Unicode trimming mismatch, `NOT_AVAILABLE` on supported metrics and the 64-character catalog-token boundary.

After the regressions and repairs, both reviewers returned **APPROVE** with no P0-P3. The architecture reviewer confirmed the domain boundary and per-metric failure isolation; the concurrency/invariant reviewer confirmed parity with the Kotlin factories and exact 64/65 behavior.

## Reproducible local evidence

- `npm.cmd test -- --include=src/app/data/reporting/report.mapper.spec.ts --include=src/app/data/reporting/report-http.repository.spec.ts` — 2 files, 12 tests, all passed.
- `npm.cmd test` — 242 files, 1,720 tests, all passed on the final reviewed diff.
- `npm.cmd run check:architecture` — 9 tests passed and the `Container → View → Store → UseCase → HTTP repository` scan passed.
- `npx.cmd eslint src/app/domain/reporting src/app/data/reporting src/app/core/tokens/reporting.tokens.ts src/app/app.config.ts` — passed with no findings.
- `npm.cmd run build` — passed. The existing initial-bundle warning remains: 738.65 kB against the 700 kB warning budget; it is not introduced as a PCC-012C acceptance gate.
- `git diff --check` — passed.

## Remaining boundary

PCC-012C is complete. The actor-bound dashboard/navigation is PCC-012D; safe CSV download and integrated accessible browser journeys are PCC-012E. Hosted CI and merge evidence remain PCC-013 and are not claimed here.
