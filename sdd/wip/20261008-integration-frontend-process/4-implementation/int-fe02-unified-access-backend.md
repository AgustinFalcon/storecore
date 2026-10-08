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

Backend-port unit/controller run before P2: **PASS, 49 tests in 9 suites, zero failures/errors**
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

## P2 selection budget capacity hardening

The reviewed IP+challenge rejection key alone allowed arbitrary anonymous hashes
to fill 10,000 entries and turn subsequent legitimate requests into global 429.
The capacity policy is now closed: `AttemptCapacityPolicy.FailClosed` remains the
default for credential/source windows; only the selection rejection window uses
`EvictOldest`. Selection first atomically acquires one of ten **submission** slots
per trusted-resolved IP in fifteen minutes, before constructing a hash key,
Unknown handling, challenge lookup or DB access. This is intentionally stricter
than the per-challenge rejected-selection limit. Success does not refund a slot.

Each admitted request owns a `SelectionAdmission`; rejection is idempotent even
under duplicate concurrent callbacks. The separate IP+hash rejection window keeps
the ten-rejection limit and can evict its oldest entry when full. Eviction cannot
reopen a real challenge beyond ten submissions: source admission evidence remains
independent, unmodified, and non-evicting. Random hashes therefore never cause a
capacity 429 for an unrelated source. There is no challenge-existence lookup in
admission, DB oracle, secret logging, session authority or retry/replay exception.

Both maps remain bounded (10,000 source IPs, 10,000 challenge keys by default).
The source cap counts validated network sources, not JSON hashes; a distributed
flood from 10,000 distinct real IPs can still exhaust this process-local source
capacity, which deliberately fails closed rather than resetting live source
throttling. That infrastructure limit is not claimed as distributed DoS protection.
HTTP selection fixtures invalidate their Spring context after each test so test
cases sharing loopback do not consume each other's new aggregate source slots.

P2 tests exercise 10,000 random Unknown selections with challenge capacity two,
one-key overflow followed by a legitimate different source, a real challenge
after eviction by twenty other IPs, 24-way final-slot contention and idempotent
rejection callbacks. Final P2 result: **PASS, 53 tests in the complete nine suites,
zero failures/errors, exit 0**. All production/test sources compiled, including
the HTTP test isolation changes. `git diff --check` also passed. Same local JDK21
runtime and target17 as above; no new hosted CI JDK17 claim.
Database/browser gates remain NOT_RUN for the previously recorded Docker block.

## Hosted #179 regression follow-up

Hosted backend for PR [#179](https://github.com/AgustinFalcon/storecore/pull/179)
at `48fe9e93339b3bc0a70b6a421724a35df2856e9c` actually executed 341 tests and
reported four failures, as relayed by the coordinating task: three historical
ceiling expectations stopped at V20 although V21 was now applied, and the mixed
unified/legacy HTTP budget test expected 429 but received 401 on request six.
That run is a genuine failed execution, not an empty-step or quota failure.

Posc002fAcceptanceMatrixTest now expects contiguous V1..V21 after its V7 upgrade
while retaining the seeded-data, disabled companion and historical-gate assertions.
Dsp003StockDesiredChangedTest expects ceiling21 while retaining the unchanged
V18 hash and durable outbox assertions. Dsp008UpgradeCoexistenceTest requires the
exact additive UA V21 filename/history and reserves V22 as next-free; its V20
effective legacy-privilege retirement tests remain intact. No migration changed.

Credential investigation verified that legacy JDBC login and the unified
coordinator both acquire the same injected LoginAttemptBudget before password
work, use CanonicalEmail.fromWire and resolve client addresses through the same
trusted-proxy boundary. No production reset, realm partition or selection-budget
sharing was found. New CredentialEndpointBudgetTest invokes both real controllers
and real use cases (JDBC/password work substituted) with alternate direct/proxy
peers resolving to the **same** IP, while varying NFKC/case/whitespace email wire.
Exactly five mixed submissions fail generically, the sixth is rate-limited before
any additional password work; exhausting selection admission does not consume or
reset credential slots. Those two wiring assertions passed locally.

The old real-HTTP fixture used localhost for general requests but 127.0.0.1 for
its no-retry client. localhost can resolve to distinct IPv4/IPv6 peer addresses,
which are intentionally distinct budget keys. The fixture now explicitly fixes
all calls to 127.0.0.1 and varies canonical-email wire across the three endpoints.
An additional real-HTTP test exhausts selection first, then checks the independent
five-request credential budget. The address-split explanation remains a transport
hypothesis until the actual HTTP/DB test reruns; no production rule merges IPs or
trusts spoofed forwarding headers to make the assertion pass.

Local JDK17 is available at `C:\Users\agustin\.jdks\jbr-17.0.8.1` (JBR
17.0.8.1+7-1063.1-nomod). Ten focused suites including the complete earlier nine
plus CredentialEndpointBudgetTest passed: **55 tests, zero failures/errors, exit0**.
All backend/test sources compiled on JDK17. New-test Mockito matcher nullability
was corrected before that final pass; it did not require a production change.
The full `mvn -q test` JDK17 attempt is logged at
`backend/target/int-fe02-full-maven-jdk17.log`; final outcome is recorded below.
Hosted rerun/reviews and actual HTTP/DB acceptance remain required.

Full JDK17 Maven result: **exit1, 234 reported tests, zero assertion failures,
105 infrastructure errors, 129 completed tests**. Docker initialization failed
with `AccessDeniedException \\.\pipe\docker_engine`; subsequent DB suites and
Spring contexts failed/short-circuited initialization. The count is not comparable
to hosted 341 because container-class setup errors prevent their test methods
from running. The three ceiling suites and real HTTP credential/selection tests
therefore remain NOT_RUN locally, not passing. All ten focused suites, including
the two new real-wiring unit assertions, also passed within the full attempt.
The full attempt compiled all source/tests on JDK17. `git diff --check`: PASS.
No production budget/resolver or historical SQL was changed by this follow-up.
