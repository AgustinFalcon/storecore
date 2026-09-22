# Evidence Index

## SDD Baseline Audit — 2026-09-22

- Scope: `storecore-core-v1.0.0` archivado en `sdd/features/20260921-single-tenant-installation-baseline/`.
- State: 14-task graph implemented. `/sdd.finish` archivó el WIP. `sdd-v1.0.0` sigue siendo baseline documental, no tag/release.
- Sol GO durable: `sdd/reviews/20260922-sol-go-core.md`.
- Must-fix closure: `sdd/reviews/20260922-review-mustfix-closure.md`.
- Plan: TASK-001..010 y TASK-012..015 (no existe TASK-011).
- Residual closed in-repo: TODO-003 fleet runbook; TODO-041 worker with official refetch port (CI fake); TASK-013 `npm run test:a11y`. POS/fiscal still blocked.
- Integration: https://github.com/AgustinFalcon/storecore/pull/14
- Validation: targeted backend review-fix + frontend 42 tests. No autoriza deploy, tag, POS adapter ni fiscal.
- Next: features with Sol GO (POS contract, fiscal). No live vendor credentials in CI.
