# Implementation progress

- Baseline: `2e9452eb31c96a8c81a38ef0a98f2ee5d216c631` with master Verify `42842643611` 3/3 PASS.
- Existing inventory UI is read-only and the catalog PUT carries an unsafe absolute stock mutation path.
- Coordinated GPT-6.1 Sol medium backend and UX analyses converged on delta-only commands, full-snapshot comparison, immutable receipts and explicit unknown-outcome recovery.
- Backend implementation completed with closed command/outcome/rejection types, strict wire translation, V16 immutable receipts, transactional stock/ledger/audit effects and POST/GET endpoints.
- Existing-variant catalog PUT no longer accepts stock mutation; initial stock creation remains a separate bounded path.
- Frontend implementation completed with a dedicated repository/use case/store, persisted authentication epoch, write-ahead recovery journal and an accessible responsive adjustment dialog.
- Focused backend evidence: 20 tests PASS, including PostgreSQL concurrency with reservation, consumption, expiry and RMA in both lock orders.
- Full frontend evidence: architecture and lint PASS, 173 files / 1,163 tests PASS, production build PASS.
- Real browser evidence: `check:ua-real` discovers 22 tests and `test:ua-real` passes 22/22 against the packaged backend and a fresh PostgreSQL 16 database, including exact replay, lost response recovery, global blocking, durable conflict and authority denial.
- Migration compatibility fixes validated: `CatalogAttributeOrderMigrationTest` and `CfeBaselineUpgradeMigrationTest` now expect V16; their focused rerun passes 2/2.
- Temporary PostgreSQL and runner processes were stopped and removed after evidence capture.
