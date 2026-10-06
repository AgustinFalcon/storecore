# Progress

- 2026-10-03: GPT-6.1 Astra architecture review completed; no code changes yet.
- 2026-10-03: WIP SDD, ADR, API contract, security policy, acceptance matrix and task plan created.
- 2026-10-03: Implementation intentionally not started until the pending integration backlog is sequenced and the contract review is recorded.

- 2026-10-04: Astra review found four P2 contract gaps; corrected API schemas, challenge binding, disclosure rules and shared rate-limit semantics.

- 2026-10-04: Second Astra pass identified challenge transport/BaseResponse and rate-limit reset contradictions; corrected contract and policy.

- 2026-10-04: Final Astra pass aligned challenge response transport and BaseResponse with IdentityController (code Int, nullable fields, error envelopes).

- 2026-10-04: Removed the final nullable mismatch from BaseResponse.code after Astra P3 review.
- 2026-10-04: Added closed validated destination to login and challenge responses after independent security review.

- 2026-10-06: Astra master audit and Sol gate found four implementation blockers: atomic shared budget, concrete USER home/destination matrix, rehydration/CSRF ownership, and stale BlackStore dependency.
- 2026-10-06: Added `implementation-decisions.md` closing those contracts before code. Implementation remains blocked until two independent Sol reviews approve this exact addendum SHA.
- 2026-10-06: PR #165 received two independent GPT-6.1 Sol APPROVED verdicts, Verify passed for backend/frontend, and the addendum was merged to `master` at `8e72bb4`.
- 2026-10-06: Implemented backend UA-002–UA-004 on `feature/unified-access-backend`: closed boundary/domain types, pure candidate resolution, shared atomic attempt budget, durable one-use V11 challenge, transactional selection/session issuance, exact-Origin enforcement, separate realm cookies/CSRF and closed return destinations.
- 2026-10-06: Local test compilation and 32 focused architecture/domain/security tests passed. Two independent GPT-6.1 Sol pre-reviews approved the implementation snapshot after the PostgreSQL TTL-race translation was made SQLSTATE-specific. Testcontainers HTTP/schema execution is compiled but locally blocked by Docker named-pipe ACL; hosted Verify remains the runtime database gate before merge.
- 2026-10-06: Hosted Verify run `37493901940` exposed Spring's persistence-exception proxy attempting to subclass the final Kotlin challenge repository. The repository is now explicitly open; the full hosted suite is rerun as the regression gate.
- 2026-10-06: Hosted Verify run `37494668148` executed the application and 165 backend tests; one test incorrectly expected controller JSON/cookie headers for a request rejected earlier by Spring CORS. The assertion now verifies the filter-level contract: HTTP 403, no allowed-origin response, and no cookie mutation.
- 2026-10-06: Independent security review found that raw `remoteAddr` collapses rate-limit identity behind the documented Nginx topology. Added a strict trusted-proxy CIDR resolver shared by unified and legacy login endpoints; direct peers cannot spoof forwarding headers and ambiguous trusted chains fail closed.
- 2026-10-06: Independent delta reviews closed malformed `Forwarded` parsing (missing IPv6 bracket, empty/out-of-range ports). Local compilation and 38 focused tests pass, including seven trusted-proxy and spoofing cases; hosted Verify on the resulting SHA remains mandatory.
- 2026-10-06: PR #166 head `fae95f9` passed hosted Verify `37497935693` (backend PostgreSQL/Testcontainers and frontend jobs). Two new independent GPT-6.1 Sol reviewers approved the complete exact-head diff; architecture and security evidence is recorded under `sdd/reviews/`.
- 2026-10-06: PR #166 was squash-merged to `master` at `74c7adc`. The frontend audit then identified four decisions that must be explicit before UA-005: fresh-challenge selection versus local selection of already-live sessions, independent partial-failure probe semantics, stale-flight/deduplication rules, and response-realm CSRF ownership. `frontend-coordination-addendum.md` records those gates; implementation remains blocked until two independent GPT-6.1 Sol reviews approve its exact SHA.
- 2026-10-06: PR #167 merged the independently approved frontend coordination contract to `master` at `2ec0af8`. UA-005 is implemented on `feature/unified-access-frontend`: closed access/login/probe/navigation types, one `/login`, challenge versus local dual-session selection, atomic realm probes, generation fencing, isolated logout, role-derived `/user/home`, legacy UI redirects and accessibility coverage. Local `npm run verify` passed with 134 tests, lint, architecture and production build; ten Playwright accessibility scenarios passed with mocked HTTP. The implementation is not complete or mergeable until hosted CI and two new independent exact-head Sol reviews pass.
