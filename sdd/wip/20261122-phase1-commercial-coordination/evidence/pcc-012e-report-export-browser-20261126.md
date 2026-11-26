# PCC-012E — safe report export and integrated browser evidence

Date: 2026-11-26

## Scope closed

- The Angular export boundary accepts only a valid report period plus the exact lowercase 64-character `periodToken` displayed by the dashboard.
- The browser requests `GET /api/v1/user/channel-reports.csv` with exactly `fromDate`, `toDateExclusive` and `periodToken`; it never generates or interprets CSV rows.
- A successful response must have CSV media type and the exact server filename correlated to the requested dates. Unexpected content type, disposition or filename fails closed.
- The download effect uses the validated artifact, marks the anchor `noopener` and always revokes the temporary object URL.
- Export lifecycle is the closed `ReportExportState`; raw status strings do not reach the view.
- Export failures are decoded from JSON error Blobs at the HTTP boundary into the closed `ReportExportFailureKind`; status and error code must correlate.
- Actor identity, authentication epoch, request sequence, applied dates and token are rechecked when the export response arrives. A revoked USER session, changed period or older terminal cannot publish an artifact or replace a newer export state.
- The productive HTTP fixture, real read ownership, surface-data manifest and 37-route census include `/user/reports`.
- ADMIN and OPERATOR navigation exposes Reports. The responsive dashboard presents executive totals, applied-accreditation best sellers, current low stock with exact total/truncation, payment disposition, inventory movement, return disposition and honest BlackStore availability/freshness.
- The dashboard uses the shell's canonical main landmark and therefore adds no nested `<main>`.

## UB-mode cycle

The first HTTP-boundary test failed because no export method existed. The smallest implementation added a strict export boundary and response validation. The first component test then failed because the download effect did not exist; the effect and actor-bound store flow were added. Strict reviews subsequently reproduced stale-period, revoked-session, malformed Blob and overlapping-export races; each received a regression test before its root fix. Architecture and real-route checks exposed two missing governance entries (the new surface manifest record and the 37-route expectation); both root causes were reconciled instead of bypassing the gates.

## Reproducible local evidence

- Report HTTP repository focal suite — 5/5 passed, including invalid token, unsafe response metadata, malformed Blob and status/code correlation.
- Combined reporting, download and navigation focal suites — 19/19 passed, including actor revocation, period/export races and object-URL release.
- Final dashboard component suite — 5/5 passed after semantic presentation corrections.
- Full Angular suite — 245 files, 1,734 tests, all passed.
- `npm.cmd run check:architecture` — 9 tests and architecture scan passed.
- `npm.cmd run check:psd-real` — security checks and 13 contract tests passed; 147 real-browser tests enumerated, including reports at 390/768/1440.
- Dedicated report-export Playwright journey — 3/3 passed: safe filename, stale Blob error and late artifact discard.
- `npm.cmd run test:a11y` — 202/202 Playwright journeys passed after the final contrast correction; report routes pass at mobile and desktop widths.
- `npm.cmd run build` — passed. Existing warning remains: 743.05 kB initial bundle versus the 700 kB warning budget.
- Full ESLint and `git diff --check` passed.
- Independent GPT-6.1 Sol architecture/security and UX/accessibility reviews — GO / APPROVE, no P0–P3 findings.

## Remaining boundary

PCC-012 and its delivery cuts are complete locally. PCC-013 remains open for independent reviews, hosted CI and merge. No live external credential, provider activation, deployment or homologation is claimed.
