# Implementation progress

## 2026-11-08

- Created the productive parity cut from merged `master` after PR #230.
- Audited the 26-surface Demo manifest against productive Angular routes and
  Spring controllers.
- Confirmed four Demo-only surfaces: recovery, favorites, offers and customer
  administration. Recovery remains explicitly provider-blocked; the other
  three become owned vertical slices in this WIP.
- Recorded overview and locally authoritative data-richness work without
  enabling external providers.
- The first independent Sol product and security reviews returned
  `CHANGES_REQUESTED`. Remediation froze favorite DTO/idempotency/unavailable
  behavior, FAVORITES capability promotion and customer actor authorization,
  offer transition/margin limits, USER CSRF, customer role/PII boundaries,
  transactional suspension/session revocation, overview semantics and the
  per-vertical dual-Sol review protocol.
- Added `surface-data-manifest.json` with all 26 identities, current route,
  endpoint ownership, loader stage and honest coverage residual. Its
  deterministic source-alignment test passed 2/2; PSD-T01 is now actually done.
- The remediated spec requires a new independent review before PSD-T02 GO.
- Two independent Sol reviewers approved the remediated PSD-T02 contract.
- Implemented the productive Favorites vertical end to end: additive V12,
  CUSTOMER capability authorization, idempotent API, Angular HTTP repository,
  closed wire types, account route and product-detail favorite action.
- Remediated review findings for CUSTOMER capability projection, private
  response caching, serialized CSRF-rotating mutations, strict wire mapping and
  fail-closed Unknown availability.
- Final local evidence: frontend `npm run verify` PASS (136 files, 992 tests);
  backend PostgreSQL 16 focal gate PASS (22 tests); both independent GPT-6.1
  Sol code/product and security re-reviews APPROVED with no P0-P3. The real
  browser journey remains owned by cumulative PSD-T08 and is not claimed here.

