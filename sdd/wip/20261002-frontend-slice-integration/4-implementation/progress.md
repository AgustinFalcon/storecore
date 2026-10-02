# Evidence — 2026-10-02

Principal reported combined PR #135 run 37065046894 frontend failure: three composition tests and one unhandled error, Sesión interna sin rol reconocido. That run was cancelled after the frontend failure; it is not a successful hosted result. Source inspection found the shared USER success fixture still used roles:[]. The closed-role domain guard is correct and unchanged.

Updated only use-case.providers.spec.ts: typed UserSessionResult with UserRole.Operator, closed-result assertion, CSRF call-count assertions, and one empty/Unknown-only composition regression covering both sign-in and probe, USER cleanup, CUSTOMER preservation and no invalid-probe CSRF read. Existing tests are preserved.

PASS: architecture (six Node boundary tests plus production scan), lint, TypeScript app/spec, git diff --check.
BLOCKED: npm test -- --include=src/app/core/providers/use-case.providers.spec.ts exited 1 before tests ran; native esbuild/angular compiler could not read ../../../../../../.. (Acceso denegado), then failed to resolve source/framework/styles entries. This is not a test pass. Runner exited; no server was started.

Hosted combined verification remains pending. No dependency/lockfile, production, backend, commit/push/merge or live changes.

## Combined hosted verification completed

The principal confirmed combined PR #135 run 37065984512 SUCCESS at head 24230790702903b367b56bc9dc15feb508c7423f. Frontend started 21:17:57 and completed 21:20:10 (2m13): verify, Chromium and accessibility all successful. Backend started 21:17:57 and completed 21:22:56 (4m59): tests successful. Times are recorded exactly as supplied by the principal, without assuming a timezone.

This supersedes the pending hosted-verification status above but preserves the failed/cancelled 37065046894 history and local ACL limitation. This update changes only integration SDD metadata, tasks and evidence; no code/commit/push. Successful CI does not assert review completion, GO, merge, promotion or live authorization.
