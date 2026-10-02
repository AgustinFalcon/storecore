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
