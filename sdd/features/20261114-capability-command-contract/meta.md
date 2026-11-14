# Capability command contract

- **Status:** approved-for-review
- **Issue:** #136
- **Base:** `master cd90726e8d9b464d6c9c9d34a75b8bd63080319f`
- **Owner surface:** `/user/capabilities`
- **Scope:** StoreCore frontend contract closure over the existing protected backend endpoint.
- **Explicit exclusions:** backend/DDL changes, capability activation as part of delivery, provider calls, deploy, homologation, BlackStore, fiscal, carrier and release promotion.

This cut follows the repository SDD flow: functional spec, technical spec, task
plan, implementation, exact-diff reviews, local gates, PR gates, merge and
post-merge verification. Finite modules, states, policies and mutation phases
remain closed objects with one wire translator and an explicit `Unknown` case.
