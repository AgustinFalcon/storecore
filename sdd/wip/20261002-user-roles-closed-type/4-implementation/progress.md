# Local evidence — issue #144

Base a8874ad; branch fix/int-user-roles-closed-type.
Checkout work/storecore-user-roles-closed-type.

Implemented exact closed decoding and fixed Unknown in Kotlin and TypeScript,
known-role requirements for backend authentication/issuance/request/capability
paths and frontend sign-in/probe, and typed HTTP mapping. Added five backend
unit tests and eight frontend tests covering collections and permission
separation. Existing ADMIN/OPERATOR permissions remain unchanged.

Maven invocation was blocked by host access-denied while computing its project
real path, including an absolute -f path and direct Java launcher attempt; it
did not execute backend compilation/tests. Frontend tsc app/spec, Angular ngc
app/spec template compilation, architecture and ESLint passed. Angular runtime
tests and bundling encountered the host esbuild directory-access failure
(Cannot read directory ../../../../../../..: Access denied) before tests ran.
Hosted Verify PASS for commit `8108f5d` in GitHub Actions run `37037483113`:
frontend 1m31s and backend 5m30s. Independent Falcon review found the test
boundary P2, verified its correction, and reported no remaining P0-P3.

Published as PR #149. Dual Grok review, revalidation after base changes, merge,
deploy and release remain pending. No permission changes or requests.

Review correction: mapper regression belongs to data/mappers and session role
domain tests now use a pure session-effects object. Neither domain test imports
data, core or Angular. The constructor dependency type is inferred locally for
compatibility with the session port introduced by the separate #146 cut.
