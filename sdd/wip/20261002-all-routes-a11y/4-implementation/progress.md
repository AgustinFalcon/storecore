# Local evidence — 2026-10-02

Branch test/int-all-routes-a11y; base a8874ad. No commit/push/PR/merge/live action.

PASS: Playwright --list collected 25 tests (24 route cases plus exact manifest reconciliation), using existing workspace dependencies through NODE_PATH without a junction. Collection is not runtime success.
BLOCKED: npm ci --ignore-scripts --no-audit --no-fund --offline with workspace cache returned ENOTCACHED for zone.js 0.15.1.
BLOCKED: npm ci --ignore-scripts --no-audit --no-fund with workspace cache, fetch-retries=0 and fetch-timeout=10000 returned EACCES fetching that tarball; npm also reported EPERM cleaning a partial dependency directory.

The principal subsequently completed npm ci in this isolated checkout. Architecture, ESLint (src plus new e2e), TypeScript app/spec and local Playwright collection passed. Manifest/fixture strict standalone type checks passed. Exact AST/manifest reconciliation also executed successfully outside the browser: 24 leaf paths match. git diff --check passed. Baseline audit reports 10 pre-existing vulnerabilities; issue #141 handles dependency remediation separately. No dependency/lock changes belong to #148; package.json only expands the lint script to cover e2e.

Browser execution attempted with npm run test:a11y -- --workers=2: BLOCKED before browser startup by native esbuild access to parent directories (Cannot read directory ../../../../../../..: Access denied) and unresolved main.ts/styles. Hosted verification remains required. An additional E2E standalone TypeScript check could not run because baseline does not provide @types/node; Playwright does collect/transpile those files. This is separate from passing app/spec type checks.

The blocked run was interrupted and exited with code 1; no listener on the configured preview port was observed afterward. Process enumeration through CIM was denied by the host. No browser/runtime success is claimed.

No skipped or unexecuted browser checks are claimed green. Production build and hosted CI remain unverified.

## Review corrections

Three P2 findings corrected: API origin validation in the last-registered API handler itself; fixture-value/published-block readiness for profile/content; parser classification of empty children and explicit rejection of unsupported lazy topology.

PASS after correction: architecture; ESLint src+e2e; TypeScript app/spec; strict standalone typecheck of fixtures, manifest, fixture-policy tests and readiness helper/tests; Playwright collection (33 tests: 24 route cases, one exact-manifest check, eight focused regressions); git diff --check. The eight focused tests executed successfully via a temporary workspace config without the Angular webServer: three fixture boundary tests, three parser tests, two Chromium readiness tests (8 passed). The test files remain included in the normal test:a11y CI suite; the temporary validation config is not part of this repository.

The 24 full Angular route cases remain BLOCKED by the already-recorded esbuild ACL limitation, not passing. No new Angular server was started for the focused tests.

## PR #151 CI repair — 2026-10-02

Hosted run 37038843197 failed: 18 routes only on Google Fonts unmatched requests, five routes on serious axe contrast/label violations (eight nodes), and customer/orders on stale tbody readiness. The principal supplied the complete failure classification after this subagent's GitHub log fetch was denied by the network socket policy. No successful hosted rerun is asserted here.

Implemented only the requested repairs: exact optional font stylesheet abort policy without network or relaxed API/origin rules; order-card readiness plus loaded order/product assertions; faint-ink #52525b on canvas/info backgrounds; order-specific tracking accessible name. Added focused negative policy, empty order-list/line rejection and production-Sass axe contrast tests; component regression asserts tracking aria-label. Favorites authorization, domain transitions, dependencies and lockfile are unchanged.

PASS: architecture, ESLint src+e2e, TypeScript app/spec, Playwright collection (36 tests: 24 routes, exact manifest, eleven focused regressions), and all eleven focused regressions (4.5s). Chromium executed the real-Sass contrast test and readiness tests without the Angular webServer. Component tests were typechecked, not claimed executed. Full Angular runtime/build retain the recorded native esbuild ACL limitation; hosted CI rerun is required. No new Angular server was started; the focused runner completed and exited normally. No commit/push/merge in this repair turn.

## Font URL canonicalization follow-up

The principal reported hosted run 37059532423: architecture/lint/unit/build passed, and twelve auxiliary tests passed. All 24 route cases still failed solely on one unmatched Google Fonts /css2 request each; the previous axe/readiness failures did not recur. Therefore that hosted run is failed, not green. Textual url.href equality was too strict for Chromium's query encoding/canonicalization.

Replaced textual equality with a strict semantic predicate: GET stylesheet, exact HTTPS fonts.googleapis.com origin and /css2 pathname, exactly one expected family and display parameter, no extras/duplicates/credentials/fragments. Added encoded/reordered positive cases and extra/duplicate/wrong-value/protocol/port/credential/fragment negatives. Network remains aborted. A hosted rerun remains required; no commit/push/merge is authorized by these local results.

Local PASS for this follow-up: architecture; lint; strict standalone TypeScript check of fixture/manifest/policy; all eleven focused tests (4.6s); rerun of the final four fixture-policy tests (1.0s); collection of all 36 tests; git diff --check. No Angular webServer started; focused runners exited normally. Full 24-route hosted success remains pending.

## Stable font boundary follow-up

The principal reported run 37060592203: all 24 route cases failed only on Unmatched request https://fonts.googleapis.com/css2; twelve auxiliary tests passed and no axe/readiness failure recurred. This hosted run is failed. The prior strict query predicate remains unsuitable for the request observed in Chromium.

At the principal's explicit direction, classify the font as expected offline abort by the stable boundary only: GET, stylesheet, exact HTTPS fonts.googleapis.com origin and /css2 pathname, no username/password/hash. Any query is accepted solely for aborting, never for fetching/fulfilling. Regressions cover canonical/encoded/reordered/empty/extra/duplicate/varied-value query forms and reject boundary changes and API requests. Hosted 24-route success remains pending; no commit/push/merge in this follow-up.

Local PASS: architecture, lint, strict fixture/manifest/policy typecheck, all eleven focused tests (5.3s), git diff --check. No Angular server started; focused runner exited normally. These focused checks are not a successful 24-route hosted run.

## Diagnostic-only follow-up

The principal reported run 37061721418: backend passed, twelve auxiliary checks passed, all 24 route cases still failed only on unmatched Google Fonts requests. Hosted frontend is still failed. No policy expansion was made: catch-all unexpected entries now serialize kind, request method, resourceType and complete URL.href as JSON, with username/password removed from a copy before serialization and no headers/cookies. Negative boundary tests assert those exact diagnostic fields and credential redaction. The diagnostic is intended to identify the actual failing request on the next hosted run, not to claim resolution.

Local PASS: architecture, lint, strict fixture/manifest/policy typecheck, four focused fixture-policy regressions (final sanitized version: 1.2s), git diff --check. Runner exited normally; no Angular server started. Hosted route failure remains unresolved pending the new diagnostic.

## Diagnosed XHR font policy

The principal supplied the exact run 37062853587 diagnostic: GET, resourceType=xhr, https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;650;700&display=swap. The run was cancelled after frontend for resource conservation; it is not a successful hosted result. The mismatch was resource type, not query encoding.

Restored strict semantic family/display query and admitted only Stylesheet/Xhr through the closed OfflineFontResource class (private constructor, static cases, Unknown, unique fromWire, rule on the type). Both cases always abort offline. Tests share static instances and cover translation, encoding/order, extra/duplicate/missing/changed query, fetch/document/Unknown, POST, host/path/http/port/credentials/hash and API negatives. Sanitized diagnostic remains unchanged.

Local PASS final class version: architecture, lint, strict fixture/manifest/policy typecheck, twelve focused regressions (4.8s), git diff --check. No Angular server started; focused runner exited normally. Hosted 24-route success still requires rerun; no commit/push/merge in this turn.

## Hosted verification completed — PR #151

The principal confirmed run 37064069828 SUCCESS in full: frontend 1m38 (verify, Chromium and all 24 route accessibility cases passed), backend 6m8. This supersedes the pending hosted-validation status above while preserving each prior failed/cancelled attempt and its diagnosis. The local esbuild ACL limitation did not prevent hosted verification.

This update changes SDD evidence only; no application/test/CI code changes, commit, push, merge, release or live action in this turn. Successful CI alone does not assert required review completion, Sol GO or integration authorization.
