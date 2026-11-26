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

PR `#417`, `fix: close calendar runtime and reporting gates`, closed the
corrective gate. Its reviewed head was
`c46a5f2bd54b8ae4b693bfb75aeb3fd996c00f42`; GitHub merged it into `master`
as `1e02bb32a060d7d9ab5a75772b0e07e88177a4c9` at
`2026-11-26T18:50:11Z`.

The two mandatory independent GPT-6.1 Sol receipts are persisted at:

- `sdd/reviews/20261126-sol-pr417-architecture-security.md`;
- `sdd/reviews/20261126-sol-pr417-ux-sdd.md`.

Both lanes approved exact head `c46a5f2bd54b8ae4b693bfb75aeb3fd996c00f42`
with no open P0-P3. The receipt-only successor was rechecked by both lanes
without further edits. The runtime repair proves fail-closed admission for a
non-active capability, a live action kill and database uncertainty, including
serialization with concurrent kill creation before claim or handoff.

GitHub Actions run `45874700499`, attempt 2, completed successfully. It was
associated with head `c46a5f2bd54b8ae4b693bfb75aeb3fd996c00f42` and executed
GitHub's synthetic pull-request merge candidate
`f471af5025dd73653972de835dff0fe172de1fd5`, built against base
`36b08b83d1f80e7642a9fcdfe134a5a16794b9df`; it is not described as an
exact-head checkout. All seven required jobs passed:

- `repository-hygiene`;
- `frontend`;
- `backend`;
- `productive-routes-real-e2e`;
- `unified-access-real-e2e`;
- `media-broker`;
- `media-broker-pid1`.

Attempt 1 was cancelled after Maven Central returned HTTP 429 while resolving
Surefire; it did not execute the backend suite and is not represented as a
code failure or a green run. The unchanged second attempt is the hosted CI
evidence used by this close-out.

The consolidated report, partial/unavailable semantics, safe CSV delivery and
responsive browser journeys remain delivered. The specification route
correction is part of the same PR `#417` close-out.

PCC-009 and PCC-013 are therefore complete. Loyalty contract work may proceed
from PCC-014, but this close-out does not approve loyalty implementation by
itself. Live provider credentials, deployment and homologation remain outside
this gate.
