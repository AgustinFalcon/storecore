# INT-FE-02 — Unified Access backend manual port

Destination baseline: `999d5c82df6e31a98eeb02ea7936b6126d3f547f`, branch
`integration/storecore-unified-access-backend`. Backend source: historical #166
`644af1d0726b0245f78cd7c77ec7a54f41cf9b61` plus the reviewed #166 merge
`74c7adc9cd8e27cad5926bb46ce01ec605febc3c` fixes (trusted proxy resolver, open JDBC repository and challenge budget).
The archived `20261003-unified-access-entry` functional, decision, security and
coexistence contracts were read from the source worktree. This is an allowlisted
manual port, not a master merge. Frontend and #176 fences belong to INT-FE-03.

Implemented: POST `/api/v1/auth/login` and `/context-selection`, closed realm /
context / candidate / resolution / return destination types, independent identity
verification and session issuance ports, one 120-second opaque hashed challenge
bound to nonce and accepted Origin, row-lock transaction for consumption + current
activity/role validation + session issuance. Responses preserve independent
HttpOnly Secure host cookies, CSRF ownership and no-store. USER/CUSTOMER remain
independent identities. Legacy credential endpoints remain compatible (UA-007),
use the same atomic five-attempt logical budget and trusted source-address resolver.
Success never resets failure evidence. No subject IDs or credentials enter the
unified public JSON. Terminal challenge rejection expires its binding cookie.

Integration's realm-budget/top5 limiter, its per-realm memory cap, latest-five
failure retention and monotonic watermark were retained. Shared logical and
selection budgets are bounded and use hashed keys; their clock watermark also
survives rewind. Capacity fixture invalidates its Spring context after the method,
because production success/compatibility clear no longer erases limiter evidence.
Capability, POSC, DSP, inventory, fulfillment and frontend files were not replaced.

## Migration inventory and database gate

There are 20 historical migration files V1..V20 in the destination, including
V11 POSC catalog revision and V20 capability overload retirement. V21 was absent
and is the sole new migration: `V21__unified_access_challenges.sql`. No historical
migration changed; no repair, checksum replacement or master V11 is introduced.
The new SQL retains the challenge immutable-evidence trigger and grants runtime
SELECT/INSERT/UPDATE but not DELETE.

Schema tests now cover clean install challenge constraints/ACL/immutability and
V20→V21 forward upgrade with identical historical Flyway checksums, retained
companion tables and DSP outbox column, and no runtime EXECUTE on legacy bigint
capability signatures. Effective database ACL inventory and flyway_schema_history
cannot be claimed from static file inspection: those assertions require PostgreSQL.

## Evidence, 2026-10-08

Local runtime: Microsoft JDK 21.0.12.101 (pom bytecode target remains 17), Maven
`C:\maven\bin\mvn.cmd`, temporary subst V: pointing at this worktree. Worktree's
JDK17 directory was empty; JDK21 diagnostic execution was explicitly accepted by
the coordinating task. This does not replace hosted Temurin17 validation.

Reproducible local unit command from V:\backend:

```powershell
& C:\maven\bin\mvn.cmd '-Dmaven.repo.local=C:/Users/agustin/.m2/repository' -q '-Dtest=AttemptBudgetsTest,ClientAddressResolverTest,IdentityExceptionAdviceTest,InternalRoleTest,LoginRateLimiterTest,ReturnDestinationTest,UnifiedAccessResolutionTest,UnifiedLoginRequestValidationTest,UnifiedAccessControllerTest' test
```

Final unit/controller run: **PASS, 49 tests in 9 suites, zero failures/errors**
and exit code 0. All backend production and test sources compiled in the same
Maven run, including HTTP/JDBC/schema tests. Controller tests use an
application stub and real origin/cookie/address boundary, not browser or DB evidence.
Surefire files live under `backend/target/surefire-reports/` (ignored artifacts).

An intermediate new controller assertion failed because getValuesAsList splits
the Expires comma in Set-Cookie. It was corrected to the raw Set-Cookie header
list, then all three controller assertions passed in the final run. Production
cookie behavior did not need a change. The clock-rewind budget regression passed.
Final source reconciliation restored reviewed #166 selection abuse keys to
source IP + challenge hash (rather than the historical per-IP-only variant),
with its independent-challenge and capacity tests. The final test count reflects
removal of the obsolete per-IP-only expectation.
`git diff --check`: PASS. Static historical migration diff against destination:
empty; clean/upgrade execution remains blocked below.

Initial mixed run selected IdentityTask004EvidenceTest as well: 47 tests, zero
assertion failures, one initialization error; 46 unit assertions passed. The DB
test did not reach assertions: `AccessDeniedException \\.\pipe\docker_engine`.
`docker info` independently returned permission denied on the Docker API. Therefore
IdentityTask004EvidenceTest, IdentityHttpIntegrationTest and CoreSchemaMigrationTest
(clean and upgrade) are **NOT_RUN / infrastructure blocked**, not successful DB
evidence. Added HTTP/JDBC tests cover customer-only/user-only/dual candidate,
challenge replay, two concurrent selections, wrong nonce/Unknown context, expired
challenge and USER-role removal rollback. They compile but still require execution.

RealLocal Angular→Spring→PostgreSQL, browser cookie races, full backend regression,
hosted CI JDK17, dual reviews and INT-FE-02 acceptance remain pending. No external
activation, frontend completion, merge, publication, release or homologation claim.
