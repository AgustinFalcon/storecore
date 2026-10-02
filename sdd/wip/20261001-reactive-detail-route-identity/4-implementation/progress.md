# Local progress — issue #142

Checkout: work/storecore-reactive-detail-route-identity.
Branch: fix/int-reactive-detail-route-identity.
Base: a8874ad.

Implemented route subscriptions in four detail containers, admin load-generation
response fencing, current-order command guards, tracking draft reset and busy
controls. Added actual-router reuse tests and delayed-response store tests;
retained checkout forged-return-query coverage.

Architecture and ESLint passed. TypeScript app/spec checking and Angular ngc
app/spec template compilation passed after correcting test compilation errors.
git diff --check passed. Angular test execution and production bundling
encountered host filesystem access failures in esbuild resolving project paths
and Angular imports (Cannot read directory ../../../../../../..: Access denied),
so no runtime test success or successful production build is claimed.

Added eight router/teardown tests, two customer/product cancellation tests, eleven
admin cancellation/mutation tests and one tracking/busy view test. Existing
checkout query-authority test was adapted to the reactive paramMap contract.

Review P2 correction: shared GET loading did not preserve POST occupancy through
A to B to A. Mutation occupancy now lives independently per order identity and
is released by finalize regardless of route generation. Four exact race tests
cover pending ship/RMA success/error after the returned A GET finishes, rejection
of both repeated command types, and release permitting a later command. A fifth
test verifies concurrent different-order shipments retain separate occupancy.

No commit, push, PR, merge, deploy, archive or release performed. Required
reviews and hosted verification remain pending.
