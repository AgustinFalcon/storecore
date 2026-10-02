# Evidence — 2026-10-02

Principal reported combined PR #135 run 37065046894 frontend failure: three composition tests and one unhandled error, Sesión interna sin rol reconocido. Source inspection found the shared USER success fixture still used roles:[]. The closed-role domain guard is correct and unchanged.

Updated only use-case.providers.spec.ts: typed UserSessionResult with UserRole.Operator, closed-result assertion, CSRF call-count assertions, and one empty/Unknown-only composition regression covering both sign-in and probe, USER cleanup, CUSTOMER preservation and no invalid-probe CSRF read. Existing tests are preserved.

PASS: architecture (six Node boundary tests plus production scan), lint, TypeScript app/spec, git diff --check.
BLOCKED: npm test -- --include=src/app/core/providers/use-case.providers.spec.ts exited 1 before tests ran; native esbuild/angular compiler could not read ../../../../../../.. (Acceso denegado), then failed to resolve source/framework/styles entries. This is not a test pass. Runner exited; no server was started.

Hosted combined verification remains pending. No dependency/lockfile, production, backend, commit/push/merge or live changes.
