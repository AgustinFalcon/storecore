# Framework-free use cases and effective gate

Baseline defects: 31 domain use cases import Angular decorators and core DI tokens; seven depend on signal-backed concrete core sessions. check-architecture.mjs computes domain/... but matches /domain/, so no domain check runs; its filename filter also excludes use cases and auxiliary types.

Keep paths and RxJS contracts stable. Domain use cases become plain classes accepting repository interfaces. CustomerSessionPort and UserSessionPort expose only markAuthenticated/clear; existing core sessions implement them. Angular USE_CASE_PROVIDERS owns explicit useFactory/deps wiring, and app.config uses that registry. No generic session registry, realm crossover or role change is introduced.

The gate parses every domain TypeScript file, including pure domain tests, using the existing TypeScript dependency. Normalize Windows separators and match the domain/ root. Inspect static imports, reexports, type imports, import-equals, dynamic import and require, plus TypeScript triple-slash types/path directives. Relative imports and file references (including bare local paths) must resolve within domain; external type/package dependencies are the existing RxJS APIs. Absolute file references, nonliteral dynamic specifiers and unapproved aliases are rejected. Comments and string content are not imports; syntactic triple-slash dependency directives are inspected explicitly. Existing fixture, presentational-view and HTTP-composition checks remain.

Regression gates: Node checker tests are included in npm run check:architecture and therefore verify/hosted CI. Angular composition smoke uses the actual appConfig with substituted repository ports; it resolves all 31 factories and exercises distinct customer/user effects, failures and CSRF ordering. Existing domain business tests remain, with the customer sign-in test using a pure session-port fake.

One reviewable PR is recommended: a decorator-only or gate-only partial integration is incomplete/broken. Review the final diff in domain, composition and gate blocks. No dependency/version/lockfile change, backend test requirement, DDL or live I/O belongs to this cut.
