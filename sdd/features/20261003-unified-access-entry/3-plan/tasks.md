# Implementation plan

- [x] UA-001 Approve SDD/ADR/addendum and reconcile ADR-003, STATUS, PATTERNS and traceability.
- [x] UA-002 Add closed domain types, candidate ports, and pure resolution use case.
- [x] UA-003 Add atomic server-side challenge persistence, TTL, replay and race tests.
- [x] UA-004 Add unified API, shared rate budget, safe return-path validation and HTTP tests.
- [x] UA-005 Add `/login`, closed mapper/coordinator/step objects, dynamic home,
  guards and accessibility tests under the approved frontend coordination
  addendum.
- [x] UA-006 Run backend/frontend CI, security review, architecture review and dual GPT-6.1 Sol review.
- [x] UA-007 Complete repository consumer inventory and real-backend browser
  E2E, then record the compatibility decision. The UI redirects legacy session
  routes to `/login`; the inventory found supported executable consumers, so
  legacy HTTP credential endpoints remain supported and non-deprecated. A
  possible future removal is separately deferred as `TODO-043` and is not an
  acceptance criterion of this completed feature.
- [x] UA-008 Reference the completed BlackStore staff-auth work; do not federate in this feature.
