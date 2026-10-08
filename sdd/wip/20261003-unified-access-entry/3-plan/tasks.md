# Implementation plan

- [x] UA-001 Approve SDD/ADR/addendum and reconcile ADR-003, STATUS, PATTERNS and traceability.
- [x] UA-002 Add closed domain types, candidate ports, and pure resolution use case.
- [x] UA-003 Add atomic server-side challenge persistence, TTL, replay and race tests.
- [x] UA-004 Add unified API, shared rate budget, safe return-path validation and HTTP tests.
- [ ] UA-005 Add `/login`, mapper/store/steps, dynamic home, guards and accessibility tests.
  - [x] UA-005a Implement `/login`, closed response types, HTTP repository, realm-specific session issuance, credential/challenge flow, bounded safe return destination, loading/rejection/expiry/error states and unit/component accessibility checks.
  - [ ] UA-005b Implement dynamic homes, navigation, guards and independent session rehydration/context switching. The USER home destination `/user/home` is an integration dependency, not delivered by UA-005a.
- [ ] UA-006 Run backend/frontend CI, security review, architecture review and dual GPT-6.1 Sol review.
- [ ] UA-007 Deprecate legacy login entry points only after consumer inventory and E2E evidence.
- [x] UA-008 Reference the completed BlackStore staff-auth work; do not federate in this feature.
