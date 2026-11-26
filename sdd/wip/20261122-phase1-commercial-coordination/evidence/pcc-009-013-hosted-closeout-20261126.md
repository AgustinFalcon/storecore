# PCC-009 / PCC-013 — hosted close-out

Date: 2026-11-26

## Exact reviewed delivery

- Pull request: `#415`, `feat: deliver commercial coordination and reporting`.
- Base: `master`.
- Reviewed and gated head: `3f1bdf0d586a157d93e3983bcb79b2be372fdcc4`.
- Merge commit on `master`: `52922f5edd043d73563bba43467dab58613fbab9`.
- Merged at: `2026-11-26T16:37:03Z`.

The merge contains the previously reviewed calendar activation cuts and the
reporting delivery cuts. It does not activate SMTP, Mercado Pago, Mercado
Libre, BlackStore, fiscal, carrier or any other external provider.

## Review evidence

- Calendar close-out: two independent GPT-6.1 Sol reviews approved the final
  concurrency, no-backfill, closed-type and presentation repairs with no open
  P0–P3 findings. The detailed local evidence remains in
  `pcc-009-local-validation-20261125.md`.
- Reporting close-out: independent GPT-6.1 Sol architecture/security and
  UX/accessibility reviews returned GO / APPROVE with no P0–P3 findings. The
  detailed exact implementation and local suites remain in
  `pcc-012e-report-export-browser-20261126.md`.

## Hosted CI evidence

GitHub Actions run `45856138284` completed successfully on the exact reviewed
head. All seven jobs passed:

- `repository-hygiene` — 10 s;
- `frontend` — 6 min 4 s;
- `backend` — 12 min 33 s;
- `productive-routes-real-e2e` — 7 min 18 s;
- `unified-access-real-e2e` — 6 min 48 s;
- `media-broker` — 1 min 11 s;
- `media-broker-pid1` — 25 min 47 s.

The productive route artifact reports 147 browser cases, zero failures, 111
route acceptances and 17 action acceptances. It runs real PostgreSQL, Spring,
the production Angular build and Chromium under the isolated Linux contract.

## Gate result

PCC-008 and PCC-009 are complete: the bounded calendar UI, local runner
activation and reminder flow have independent reviews, hosted CI and a merge
on `master`.

PCC-013 is complete: the consolidated report, partial/unavailable semantics,
safe CSV delivery and responsive browser journeys have independent reviews,
hosted CI and a merge on `master`.

The next authorized delivery slice is loyalty (`PCC-014` onward). Live
provider credentials, deployment and homologation remain outside this gate.
