# Implementation plan

- [x] CSA-001 Document master-only scope, inherited actor-only boundary, functional
  acceptance and V10 technical contract in this WIP.
- [x] CSA-002 Implement forward-only V10 with four session-bound entry points,
  current USER/ADMIN validation, safe definer settings and legacy privilege revocation.
- [x] CSA-003 Pass authenticated principal session IDs from JDBC administration
  and update direct-SQL fixtures to use real sessions without broadening HTTP inputs.
- [x] CSA-004 Verify fresh/upgrade migrations, V1–V9 immutability, catalog privileges,
  runtime denials and the four-operation session rejection matrix.
- [x] CSA-005 Verify stale versions, wrong-module IDs, atomic lifecycle/audit,
  shadowing and authentication-to-mutation revocation regressions; run backend checks.
- [x] CSA-006 Record exact base/head and checks; obtain two independent GPT-6.1 Sol
  reviews in parallel, resolve actionable findings and require both APPROVED.
- [x] CSA-007 Close out progress with actual evidence and residual limits. PR/merge
  and archive status are recorded only when they occur; no deploy/tag/publish.

Traceability: CSA-F01→CSA-002/003/004; CSA-F02/03/04→CSA-002/004;
CSA-F05/06→CSA-005. Tx-C and BlackStore integration are not tasks in this plan.
