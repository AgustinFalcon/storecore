# PCC-008B reminder-switch implementation evidence — 2026-11-25

## Scope and activation boundary

This cut implements the temporary, audited commercial-calendar reminder-switch contract through domain, PostgreSQL, application, HTTP and ADMIN diagnostic UI layers. It deliberately installs no scheduler, timer, background executor, candidate claim, notification handoff, email transport or automatic readiness/capability transition. Readiness remains `UNAVAILABLE`; runner activation remains prohibited until the separately reviewed PCC-008C..F cuts.

All switch operations, configured/effective states and affected actions are closed domain types. Wire values enter through one translator and unknown values fail closed. The view, mapper and tests do not make policy decisions from magic strings.

## Test-first defects exposed and repaired

The red/green implementation loop exposed the following defects before approval:

1. the initial HTTP translator contract was absent and failed compilation;
2. PostgreSQL function arguments were inferred incorrectly until the writer supplied explicit database casts and used a query path for the returning function;
3. a migration test reused polluted bootstrap state until its database was isolated;
4. the diagnostic endpoint still returned the PCC-008A shape instead of the exact configured/effective snapshot;
5. a nanosecond production clock violated the exact whole-second wire/database contract until the infrastructure boundary canonicalized it;
6. capability denial was correctly classified but marked the enclosing switch transaction rollback-only, producing HTTP 500 until the read-only capability decision declared `noRollbackFor` its business denial;
7. the first audit implementation counted and paged in separate `READ_COMMITTED` statements; security review rejected it until a single materialized-CTE statement produced both total and page from one snapshot;
8. the full backend suite found historical migration tests pinned to latest version V36; those latest-version assertions were advanced to V37 without weakening checksum preservation checks.

## Implemented guarantees

- Exact ADMIN-only POST, receipt recovery, audit and diagnostic routes with CSRF on mutation.
- Revision compare-and-set, global UUID collision handling and actor-bound exact replay.
- Exact replay remains recoverable after expiry, later switch revisions, capability changes and temporary loss followed by restoration of ADMIN authorization.
- `ENABLE` requires the existing typed capability/action admission and bounded expiry; `DISABLE` remains a narrow authenticated safety operation when capability admission is denied.
- Effective state fails closed at expiry without a cleanup timer.
- Applied and rejected commands retain immutable requested metadata, before/after snapshots, outcome and receipt identity.
- Audit total and page are read from one PostgreSQL statement/snapshot, followed by live ADMIN revalidation.
- The frontend shows configured state, effectivity, revision, readiness and governance metadata while continuing to state that reminders are unavailable.

## Adversarial coverage

The persistence and HTTP suites cover exact replay, UUID collision, foreign/missing non-disclosing recovery, parallel CAS, minimum and excessive expiry boundaries, invalid expired disable, renewal after expired enable, capability denial, safety disable, actor role loss/regain, immutable receipts and exact audit results. Translator tests cover exact fields, canonical instants, revision grammar, the 8 KiB body limit and closed unknown handling.

## Independent reviews

- GPT-6.1 Sol architecture/implementation review at medium reasoning: `APPROVE`, no P0–P3 findings after the affected action was converted to a closed TypeScript domain type.
- GPT-6.1 Sol security review at medium reasoning: initial P2 for the two-statement audit snapshot; after the single-statement materialized-CTE repair, `APPROVE`, no P0–P3 findings.

The approvals cover PCC-008B only. They do not approve a runner, notification handoff, email delivery, external transport or PCC-008C..F activation.

## Local verification

- Focused backend domain, persistence, translator and HTTP integration suites: pass.
- Expanded PostgreSQL adversarial switch suite: pass.
- Focused Angular mapper/domain/presentation suites: 3 files, 28 tests pass.
- Full frontend `npm run verify`: architecture 9/9, project-service smoke 3/3, lint pass, 240 files and 1,705 tests pass, production build pass.
- Frontend residual warning: initial bundle 713.77 kB exceeds the 700 kB warning budget by 13.77 kB; it is non-blocking and does not change PCC-008B behavior.
- Full backend `mvn -q test`: pass, exit code 0, after the V37 latest-version repairs.
- `git diff --check`: pass before evidence finalization.

## External evidence boundary

No hosted GitHub Actions run, push, PR update or merge is claimed by this evidence. The current GitHub authentication state did not provide valid external evidence, so this cut relies only on the explicit local commands above until the external gate is run separately.
