# PCC-005 — notification validation and merge evidence

Date: 2026-11-24

## Exact identity

- PR: https://github.com/AgustinFalcon/storecore/pull/370
- base: `93776990ea665bb73bc8f95f38df24c2bdee3433`
- final reviewed head: `22c716297786c4f3d59322073d960db20644ed07`
- merge commit on `master`: `227412d6426cd488a91dd321c166ef8ea20c95be`
- hosted Verify run: `45503728183`

## Review history

Two independent GPT-6.1 Sol medium lanes reviewed the cumulative diff. The first round found one P2: lifecycle confirmation did not retain the alert revision the administrator reviewed. `NotificationTransitionIntent` now carries alert id and expected revision; the view invalidates changed revisions and the store rejects divergence before persistence or transport.

The final exact-head architecture and security reviews on `22c7162` both returned `APPROVED` with no P0–P3. They also reviewed the Linux-CI corrections: font-independent 320 px reflow, independent OPERATOR authority, 32 productive routes / 96 route acceptances and a PostgreSQL-persisted notification receipt instead of a fixed UUID.

## Local gates

- `npm run verify`: 236 files / 1,665 tests PASS and production build PASS.
- `npm run test:a11y`: 189/189 PASS.
- notification responsive matrix: 320, 390, 768 and 1440 PASS, including wider Linux-like font metrics at 320.
- PSD harness unit/read traces: 9/9 PASS; TypeScript and ESLint PASS; Playwright census 132 tests.
- `git diff --check`: PASS.
- known non-blocking warning: initial bundle 707.73 kB against the 700 kB warning budget; notification routes remain lazy.

## Hosted gates

Verify `45503728183` completed 7/7 success on the exact final head:

- repository-hygiene: 13 s
- frontend: 5 m 48 s
- backend: 13 m 57 s
- media-broker: 1 m 4 s
- media-broker-pid1: 9 m 10 s
- productive-routes-real-e2e: 7 m 2 s
- unified-access-real-e2e: 5 m 46 s

No SMTP, scheduler, external credential, deploy or external-provider activation was introduced. PCC-005 is complete; calendar contracts begin at PCC-006.
