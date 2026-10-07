# Evidence Index

## SDD Baseline Audit — 2026-09-22

- Scope: `storecore-core-v1.0.0` archivado en `sdd/features/20260921-single-tenant-installation-baseline/`.
- State: 14-task graph implemented. `/sdd.finish` archivó el WIP. `sdd-v1.0.0` sigue siendo baseline documental, no tag/release.
- Sol GO durable: `sdd/reviews/20260922-sol-go-core.md`.
- Must-fix closure: `sdd/reviews/20260922-review-mustfix-closure.md`.
- Plan: TASK-001..010 y TASK-012..015 (no existe TASK-011).
- Residual closed in-repo: TODO-003 fleet runbook; TODO-041 worker with official refetch port (CI fake); TASK-013 `npm run test:a11y`. POS/fiscal still blocked.
- Integration: https://github.com/AgustinFalcon/storecore/pull/14
- Validation: frontend 42 unit tests + `npm run test:a11y`; `InboxApplicationWorkerTest` + unconfigured RECEIVED. No autoriza deploy, tag, POS adapter ni fiscal.
- Next: features with Sol GO (POS contract, fiscal). No live vendor credentials in CI.

## Unified access — 2026-10-06

- Archive: `sdd/features/20261003-unified-access-entry/`.
- Delivery: PRs #165–#169; final functional master commit `99380a656562c784dc8fc4805eccc2a835a2ea48`.
- PR #169 exact-head Verify `37526296154`: backend, frontend and real E2E SUCCESS; 12/12 PostgreSQL/Spring/Angular HTTPS/Chromium scenarios. Post-merge `master` Verify `37528646167` repeated all three jobs successfully on `99380a656562c784dc8fc4805eccc2a835a2ea48`.
- Reviews: `sdd/reviews/20261006-sol-pr169-architecture.md` and `sdd/reviews/20261006-sol-pr169-security.md`, independent OpenAI GPT-6.1 Sol medium, exact head `d20556baabe22f6a8227283215945baabe188fb0`, APPROVED.
- Compatibility: legacy UI routes redirect to `/login`; realm-specific HTTP credential endpoints remain supported/non-deprecated after inventory. Future removal is `TODO-043`.
- Non-claims: no BlackStore federation, deploy, release, fiscal/ARCA or Correo Argentino homologation.

## Commerce acceptance local — 2026-10-07

- Scope: CFE WIP `4-implementation/progress.md` acceptance addendum and
  `docs/testing/commerce-fulfillment-real-e2e.md`.
- Backend suite compilation + 21 existing unit checks PASS via cached compiler;
  2 new mocked JDBC boundary tests PASS. New HTTP/PostgreSQL cases NOT_RUN.
- `npm run check:ua-real` PASS: 17 discovered, including 4 real CFE journeys and
  a separate Unknown MockHttp case. Browser execution NOT_RUN (jar absent;
  Maven path ACL and Docker daemon access blocked). No live provider credentials.
- No commit/CI/review/clean-upgrade/acceptance closure/publication claimed.
