# Implementation and incremental evidence — 2026-10-02

Base a8874ad, branch fix/int-domain-framework-boundary; uncommitted changes for principal review. No commits, push, PR, merge, deploy, role changes or external approvals are asserted.

- DFB-001: 31 use cases are plain classes; Angular/core tokens removed. Seven session-dependent cases consume CustomerSessionPort/UserSessionPort. Core signal-backed sessions implement those ports. RxJS algorithms and repository contracts are preserved.
- DFB-002: core/providers/use-case.providers.ts owns 31 explicit factories/deps; app.config uses that registry. Nine Angular composition/session tests use actual appConfig with substituted repository ports, cover resolution, realm separation, failed sign-in/registration, probe CSRF ordering, and logout success/error behavior. The existing customer sign-in domain test now uses a pure port fake.
- DFB-003: AST gate checks all domain sources/tests, normalizes Windows paths and rejects outward/framework imports, aliases and nonliteral dynamic module specifiers. Node tests cover the previous path/suffix blind spots, static/type/dynamic imports, reexports, import-equals and comment/string false positives. A review finding identified triple-slash dependency directives as an omitted path: source.typeReferenceDirectives and referencedFiles are now checked with the equivalent package/path policy; local relative/bare file references remain valid and absolute/outward/framework references are denied. Architecture script executes its Node tests before scanning.

Passed local checks:

- Plain classes/factories: TypeScript app check.
- Final code/tests: TypeScript spec check; Angular ngc app/spec template/type checks; ESLint; git diff --check.
- Architecture gate and six Node regression tests (including triple-slash types/path regression cases). Architecture, ESLint, TypeScript app/spec, Angular ngc app/spec and diff-check were rerun after the directive correction.
- Applying the corrected checker to the existing historical decorated sources rejected all 31 use-case files (69 Angular/token/session dependency findings).
- Read-only in-memory TypeScript transpilation and Node/RxJS execution verified all seven framework-free session use cases: successful/failed sign-in and registration, probe delayed until CSRF, logout success and failed CSRF/logout cleanup. This diagnostic used pure session-port objects; it is not evidence of Angular DI composition passing.
- A separate read-only in-memory transpilation diagnostic loaded the actual USE_CASE_PROVIDERS, DI tokens and signal-backed core sessions into Angular Injector.create with substituted repositories. All 31 actual factory registrations resolved; customer/user sign-in and customer logout used distinct sessions. This verifies the registry's runtime wiring; it does not substitute for the full Angular TestBed/appConfig suite.

Full npm run verify reached ng test but native esbuild failed before compiling/executing the suite: Cannot read directory ../../../../../../..: Acceso denegado, followed by unresolved source/dependency entries across the suite. Consequently Angular test execution, composition tests, production build and hosted CI remain unverified. This environment-blocked run is not a pass; principal/hosted verification is still needed.

Dependencies are reused through an ignored node_modules junction to the existing validation checkout. No package version or lockfile change. The package script change only adds Node gate tests to the existing architecture check.

Recommended delivery is one atomic PR with three review blocks: domain/ports, composition/session regression, gate/tests. Merging a decorator-only or gate-only slice would leave broken or unenforced architecture. Required repository review/CI gates remain pending.
