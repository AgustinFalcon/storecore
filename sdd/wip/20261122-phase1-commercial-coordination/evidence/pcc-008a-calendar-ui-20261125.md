# PCC-008A — commercial calendar UI evidence

Date: 2026-11-25

## Delivered cut

- Added typed Angular month and list views over the same bounded, paginated query with explicit month, IANA display zone, lifecycle, audience, page and size URL state.
- Added USER detail plus ADMIN-only create, draft edit, preflight, explicit lifecycle confirmation, audit, exact command recovery and reminder diagnostic surfaces.
- Kept OPERATOR read-only. CUSTOMER has no route. Private audit, receipt, preflight and diagnostic calls are not made from OPERATOR paths.
- Kept reminders fail closed: diagnostic readiness is `UNAVAILABLE`; there is no switch-command route, runner, timer, email or external transport in this cut.
- Added strict DTO mappers, closed domain types, actor/epoch stale-response fences, durable exact-intent journaling and idempotent recovery.
- Added HTTP-fixture and persisted REAL_BACKEND route evidence for all four routes at 390, 768 and 1440 px. The disposable PSD fixture creates and verifies a real DRAFT through the command API before publishing its receipt.

## Local verification

- Angular full unit suite after the CI remediation: 240 files / 1,705 tests PASS.
- Calendar presentation focal suite after the CI remediation: 1 file / 15 tests PASS.
- `npm run lint`: PASS.
- `npm run check:architecture`: PASS, including the domain boundary and 33-surface productive manifest.
- `npm run check:psd-real`: PASS: security checks, 13 node contract tests, TypeScript, ESLint and discovery of 144 PSD tests.
- `npm run build`: PASS. The existing non-fatal initial-bundle budget warning remains visible; the produced initial bundle is 713.77 kB against the 700 kB warning threshold.
- `git diff --check`: PASS.

The local check does not claim execution of the disposable PostgreSQL REAL_BACKEND browser matrix. That execution remains a CI gate; the checked runner now expects 36 routes and 108 responsive route acceptances.

## Review rounds

Three GPT-6.1 Sol medium lanes reviewed architecture/correctness, security and UX/product accessibility and shared conclusions.

The first exact-head round on `7d43fbb5dd4ad7e8f10be67f3f6c66059f392a7d` requested changes for:

- invalid literal trailing source tokens that blocked compilation;
- native `datetime-local` minute serialization not being normalized to required whole seconds;
- equivalent zero offsets (`+00:00`, `-00:00`, `Z`) diverging during receipt correlation and retaining the durable mutation fence;
- native UTF-16 `maxlength` truncating valid code-point-bounded Unicode input.

All four findings were corrected with regressions. The second exact-head round on `47b45104fa41ef7cbaddedd6ccf4c91cbfeb474e` returned APPROVE from all three lanes with no open P0–P3. Security additionally rechecked the USER/CUSTOMER boundary, ADMIN private-call gates, CSRF allowlist, IDOR, XSS/DOM selectors and journal replay.

## First CI execution and remediation

GitHub Actions run `45540686999` executed the disposable PostgreSQL/Spring/production-Angular/Chromium matrix. The persisted calendar fixture and every required backend read succeeded with HTTP 200, but the productive-routes job rejected the four calendar routes at all three widths (12 cases). The exact assertion was the skip-link focus contract: each calendar view rendered a nested `<main>` inside the shell's canonical `<main id="contenido-principal">`, so the target landmark was not unique.

Commit `1385a70bcf4bb5537acfac404963b2bf315c8e14` replaces the three calendar view roots with non-landmark containers and adds a presentation regression covering center, detail and editor surfaces. The post-remediation local focal suite, full suite, lint, architecture, PSD-real contract check, build and diff check all pass. A new exact-head review round and a fresh CI execution are required before merge; the failed first execution is retained as evidence rather than reclassified as success.

## Explicit exclusions

PCC-008B through PCC-008F remain pending and individually NO-GO. This evidence does not claim reminder-switch mutation, SYSTEM orchestration, worker leases/retry, notification handoff, scheduler activation, email delivery or any external provider integration.
