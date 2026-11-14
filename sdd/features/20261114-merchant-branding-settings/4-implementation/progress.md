# Progress

Base `3d95c99eb5d85970551b0ebab71143d24b77cb9c`.

- Read-only audit confirmed home composition and manual fulfillment are already
  product-owned; the remaining #6 gap is runtime merchant branding/settings UX.
- SDD functional, technical and task specifications drafted.
- First independent specification reviews found three P2 classes: non-monotonic
  public/admin races, malformed admin authority/actor isolation, and effective
  contrast degraded by current opacity/gradient consumers. The SDD now requires
  revision/generation fences, actor-keyed cancellation, publish blocking without
  a valid authoritative revision, unblended branded tokens and deterministic
  race/render tests.
- Two independent specification re-reviews approved the corrected functional and
  technical contracts with no remaining P0-P3 finding.
- `BRAND-001` and `BRAND-002` are implemented: V23 additive persistence,
  framework-free branding domain, strict wire translation, public/ADMIN reads,
  ADMIN CAS mutation, same-origin/CSRF/capability enforcement and redacted audit
  in one identity mutation transaction. Focused backend evidence: 13/13 tests.
- `BRAND-003` and `BRAND-004` are implemented: closed frontend types, single
  boundary mapper, public monotonic store, actor-fenced ADMIN editor, conflict
  recovery, responsive Appearance route, safe logo rendering, productive route
  manifest and unblended theme tokens. Frontend evidence: `npm run verify` passed
  architecture, smoke, lint, 214 files / 1427 tests and production build;
  Chromium branding/accessibility evidence passed 5/5.
- Backend exact-diff security review approved. Bug review found and re-approved a
  corrected Flyway history assertion. The full backend run exposed a pre-existing
  local-time bug in Mercado Pago recovery: `TIMESTAMPTZ` was translated through
  `Timestamp`, producing `INVALID_SEARCH_WINDOW` outside UTC. The JDBC boundary
  now translates through `OffsetDateTime`; the previously failing focused test
  passes in `America/Buenos_Aires`.
- The repeated backend gate passed 459/459 in `America/Buenos_Aires` after the
  timestamp boundary fix. The repeated frontend gate passed architecture 9/9,
  project-service smoke 3/3, lint, 214 files / 1427 tests and production build.
- Final integrated reviews found frontend/backend validation drift for Unicode
  format names, encoded controls/separators/traversal and valid percent-encoded
  spaces. The single frontend boundary now mirrors Kotlin; exact regression
  cases pass and both Bug/Product/UX and Security re-reviews returned APPROVE.
- `BRAND-001` through `BRAND-004` are complete. Commit/PR, hosted Verify, merge
  and post-merge Verify remain pending under `BRAND-005`.
