VERDICT: APPROVED

# Grok 4.7 — PR #105 scope

**Lane:** SCOPE / IMPLEMENTATION
**PR:** https://github.com/AgustinFalcon/storecore/pull/105
**Title:** Record future DispatcherProvider issue #104 in knowledge
**GitHub base:** `integration/storecore-int`
**Branch:** `feature/dispatcher-provider-future-knowledge`
**SHA reviewed:** `a482498c522a6f4697ce4edfd3c85bcdf1455e0a`
**Reviewed diff:** `git diff origin/integration/storecore-int...HEAD` (one commit, 8 files, +14 / −5).
**No merge.** This file does not approve GitHub, does not call CI green, and does not authorize `/sdd.finish`.

`gh pr view 105` returned state `OPEN`, base `integration/storecore-int`, head `a482498`.

## What was read

1. PR title and body. Summary: register issue [#104](https://github.com/AgustinFalcon/storecore/issues/104) in knowledge, PATTERNS, TRACEABILITY, backlog TODO-043, STATUS, and CHANGELOG. Inbox stays on `UnconfiguredOfficialResourceAdapter`. `@Scheduled` workers and the POS saga do not hop. No Kotlin/Flyway. Not an ML dispatcher. Not `sdd.finish`.
2. Issue #104 (OPEN): future injection only at the first authorized outbound HTTP adapter; no code in that issue; not an ML remote dispatcher, companion live, `INSERT(variant_id)`, or `sdd.finish`.
3. Full `origin/integration/storecore-int...HEAD` diff.
4. BlackStore issue #12 (CLOSED, loopback injection already done) and #16 (OPEN, reuse on a future new HTTP client). CHANGELOG and TODO-043 cite #16 as the mirror. ML knowledge cites #12 as the injection style (io only, at the HTTP edge).

## SDD why

The WIP stays open. This cut records a deferred future I/O rule. It does not add a dispatcher, a network call, a Flyway version, or a close-out. Hosted CI is not treated as a pass.

## Diff judged

Markdown only:

- `CHANGELOG.md`
- `sdd/PATTERNS.md`
- `sdd/STATUS.md`
- `sdd/TRACEABILITY.md`
- `sdd/backlog.md`
- `sdd/wip/20260924-ml-desired-stock-projection/4-implementation/knowledge.md`
- `sdd/wip/20260924-ml-desired-stock-projection/4-implementation/progress.md`
- `sdd/wip/20260927-pos-integration-convergence/4-implementation/knowledge.md`

No `.kt`, `.sql`, `.yml`, `.yaml`, `.properties`, or `.env`. Secret-shaped assignments are absent from the eight files. SHA stamp of PR #101 is the merged commit `46db87d` on PR #103 (`Record integration SHA 7d576b3 for PR #101`).

Issue #104 is deferred: TODO-043 is `[medium] [deferred]` and says implement only when an authorized outbound HTTP adapter exists, with no hop on the saga or `@Scheduled`, and that it is not the ML dispatcher. STATUS keeps the ML WIP open: no ML dispatcher, no `sdd.finish`, no live ML/BlackStore. TRACEABILITY repeats the same boundary.

`sdd/PATTERNS.md` section `Backend threads` names Spring as owner of the servlet thread, `@Transactional` JDBC, and `@Scheduled` (`InboxApplicationWorker`, `MpOrderApplicationWorker`, `BlackStoreExpiryWorker`, inventory expiry) and says not to inject a coroutine dispatcher there. `DispatcherProvider.io` is reserved for a future authorized outbound HTTP adapter (issue #104). Those four worker sites exist in main and carry `@Scheduled`; main has no `Dispatchers` and no `DispatcherProvider`.

## Validation

Docs-only diff, so no test suite was run. Checked against current main:

- `UnconfiguredOfficialResourceAdapter.configured()` is `false`.
- Default `storecore.integrations.mp-orders.adapter` is `unconfigured` (`MpOrdersAdapterEnabledCondition`).
- `OfficialOrderApiAdapter` can build a `RestClient`, and only when that property is `official`. This PR does not authorize that property, does not inject a dispatcher into that class, and does not change the default. The deferred rule still applies when an outbound adapter is authorized.
- Inbox, MP order, BlackStore expiry, and inventory expiry workers stay on `@Scheduled`.

## Gaps

None that change this verdict. Do not merge from this note. GitHub Verify is not a pass. MP-LIVE-05, fiscal, tag, deploy, publish, and `/sdd.finish` stay refused.
