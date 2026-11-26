# PCC-012A — explicit report JSON and authenticated GET

Date: 2026-11-25

## Scope closed

- `GET /api/v1/user/channel-reports` accepts exactly one canonical `fromDate` and `toDateExclusive`, no duplicate or additional parameter.
- Normal browser reads prove same origin through a valid `Origin`, `Sec-Fetch-Site: same-origin`, or installation-origin `Referer`; contradictory, cross-site and absent evidence fail closed without mutation CSRF.
- USER `ADMIN|OPERATOR` authentication occurs before the report snapshot and is revalidated after mapping. A changed actor, session or role set publishes nothing.
- The controller returns an explicit `BaseResponse` DTO. Domain objects, private maps and convenience getters are never serialized.
- All 24 metrics have fixed DTO payloads. Lossless identifiers, counts, signed quantities and ARS values remain canonical strings.
- Each supported metric owns an exact source, time basis and `Period|Current` evidence variant. Period evidence carries flat authoritative boundaries/token; current evidence carries none. Evidence must match the outer period and observation time.
- Permanently unsupported monetary and BlackStore commercial/history/synchronization facts cannot be promoted to available. Remote freshness is exactly unavailable without evidence. Nested local activity has its own closed evidence policy.
- Successful and rejected responses are `no-store`. Request, source, mapping, authentication transaction and authorization failures map to generic closed errors without exception text.

CSV, Angular types/dashboard/download, browser journeys, hosted CI and merge remain pending.

## TDD and validation

The first red cycle failed on missing query, origin-policy and DTO-mapper symbols. The second red cycle failed on the missing controller, advice and no-store filter. Reviewer regressions then demonstrated three defects before repairs: incorrect source/time-basis/evidence variants were accepted, permanently unsupported facts could be fabricated as available, and authentication `TransactionException` escaped the generic error contract. The evidence wire also differed from the reviewed flat shape.

Final affected-suite command:

```text
mvn.cmd -q "-Dtest=ChannelReportHttpContractTest,ChannelReportControllerTest,StoreCoreCreatedOrderReportPostgresTest,StoreCoreCreatedOrderReportFailureTest,ChannelReportingDomainTest" test
```

Result: exit code 0 after all 39 migrations on PostgreSQL 16 Testcontainers.

- HTTP controller tests: 3 passed.
- HTTP DTO/query/origin contract tests: 4 passed.
- Reporting domain tests: 9 passed.
- Transaction failure test: 1 passed.
- PostgreSQL report tests, including real complete DTO mapping: 28 passed.
- Total: 45 passed, 0 failures/errors/skips.
- `git diff --check`: passed with only the Windows LF/CRLF notice.

## Review evidence

Two GPT-6.1 Sol reviewers independently reviewed architecture/wire behavior and concurrency/security. Their first review produced the evidence-policy, flat-wire and transaction-error P2 findings. After behavior-level regressions and repairs, both returned **APPROVE** with no remaining P0-P3. The approvals are limited to PCC-012A.
