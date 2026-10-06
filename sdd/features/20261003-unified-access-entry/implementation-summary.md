# Implementation summary

- Added closed backend identity candidates, login resolutions, access contexts,
  destinations and challenge results; wire values translate once and unknowns
  fail closed.
- Added an atomic, non-resetting shared logical-attempt budget across unified and
  legacy login paths, with trusted-proxy client identity parsing.
- Added durable PostgreSQL one-use challenges with a 120-second TTL, hashed
  browser binding nonce, exact-Origin selection and transactional realm session
  issuance.
- Added `/api/v1/auth/login` and `/api/v1/auth/context-selection` without merging
  CUSTOMER and USER principals, roles, cookies, CSRF or sessions.
- Added one Angular `/login`, explicit flow-step objects, fresh-challenge versus
  existing-session selection, independent probes, generation fencing, atomic
  principal/roles/CSRF publication, isolated logout and role-derived USER home.
- Redirected legacy UI session routes to `/login` with closed validated return
  destinations; retained the supported realm-specific HTTP endpoints.
- Validated the feature within the complete 139-test frontend suite, the
  architecture checks, accessibility coverage and a 12-scenario real
  PostgreSQL/Spring/Angular HTTPS/Chromium matrix.

The implementation reached `master` through PRs #165–#169. The final functional
commit is `99380a656562c784dc8fc4805eccc2a835a2ea48`. PR #169 exact head
`d20556baabe22f6a8227283215945baabe188fb0` passed GitHub Verify
`37526296154`, including 12/12 real browser scenarios, and two independent
OpenAI GPT-6.1 Sol medium reviews with no P0–P3 findings.

Residual boundary: the supported legacy credential endpoints are not deprecated;
future reconsideration is `TODO-043`. BlackStore authentication is independent.
No release, deploy, live secret, fiscal or carrier activation is included.
