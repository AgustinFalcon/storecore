# PCC-009 / PCC-013 — hosted close-out

Date: 2026-11-26

## Delivery identity

- Pull request: `#415`, `feat: deliver commercial coordination and reporting`.
- Base: `master`.
- Delivered feature head: `3f1bdf0d586a157d93e3983bcb79b2be372fdcc4`.
- Merge commit on `master`: `52922f5edd043d73563bba43467dab58613fbab9`.
- Merged at: `2026-11-26T16:37:03Z`.

The merge contains the previously reviewed calendar activation cuts and the
reporting delivery cuts. It does not activate SMTP, Mercado Pago, Mercado
Libre, BlackStore, fiscal, carrier or any other external provider.

## Governance correction

PR `#415` was merged without the two mandatory review receipts persisted
against its final feature head. Earlier slice reviews and local evidence exist,
but they do not satisfy that final-head gate and are not represented here as
if they did. The reviews requested after merge are corrective reviews, not
retroactive pre-merge approval.

Those corrective reviews found two real gaps. UX/SDD found a stale route in
the technical specification (`/user/channel-reports` instead of the delivered
`/user/reports`). Architecture/security found that reminder claim and handoff
did not revalidate the capability state and kill switch after the local
reminder switch had been enabled. PR `#417` owns both corrections, including a
closed runtime-admission type, fail-closed translation, serialization with
capability administration and PostgreSQL regression coverage.

## Hosted CI evidence

GitHub Actions run `45856138284` was associated with PR head
`3f1bdf0d586a157d93e3983bcb79b2be372fdcc4`, but GitHub Actions executed the
synthetic pull-request merge SHA
`049002adea38c3bca9fa95b5ee886b72b1bbd258`, built against base
`cca4c899936a59d602baae49ab7ec34d735778b9`. It therefore must not be
described as an exact-head run. All
seven jobs passed:

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

The feature implementation is present on `master`, but the close-out gate is
complete only after PR `#417` has two persisted independent GPT-6.1 Sol
approvals, green hosted CI and a merge. Its runtime repair must prove that a
non-active capability or action kill blocks both claim and not-yet-emitted
handoff, including a kill created concurrently with admission.

The consolidated report, partial/unavailable semantics, safe CSV delivery and
responsive browser journeys remain delivered. The specification route
correction is part of the same PR `#417` close-out.

Loyalty (`PCC-014` onward) does not start until that gate is actually closed.
Live provider credentials, deployment and homologation remain outside this
gate.
