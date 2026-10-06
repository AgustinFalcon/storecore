# UA-007 — repository legacy consumer inventory

Date: 2026-10-06. Read-only inventory at `31d1d4590795580fcf737995fc14e53412d89e0c`, followed by documentation reconciliation. This is inventory evidence, not an independent PR approval, runtime E2E result or UA-007 completion.

## Scope and reproducible search

The checkout was searched across frontend, backend, tests, scripts, resources, CI and SDD/documentation. Dependency caches, build outputs and Git internals were excluded:

```powershell
rg -n --hidden -g '!.git/**' -g '!node_modules/**' -g '!.npm-cache/**' -g '!target/**' -g '!dist/**' '/customer/auth/login|/internal/auth/login|/customer/session|/user/session' .
rg -n 'SignInCustomer|SignInUser|signIn|CustomerSessionComponent|UserSessionComponent' frontend/src
rg -n '/customer/auth/login|/internal/auth/login|/customer/session|/user/session' .github frontend/scripts backend/src/main/resources backend/pom.xml frontend/angular.json frontend/src/environments
rg --files frontend/e2e frontend/scripts .github
```

References below use line numbers from the inventory snapshot. Later implementation may move or remove them; rerun the searches on the reviewed head before a removal decision.

## Supported HTTP contracts and executable dependencies

- `backend/src/main/kotlin/com/storecore/identity/infrastructure/web/IdentityController.kt:41,45` implements both realm-specific credential POSTs. The [archived baseline spec](../features/20260921-single-tenant-installation-baseline/2-technical/spec.md) lists them at lines 28 and 34. The [implementation decisions](../wip/20261003-unified-access-entry/2-technical/implementation-decisions.md) include them in the shared atomic login budget at lines 11–12. They remain supported and are not deprecated.
- Frontend adapters: `frontend/src/app/data/customer/customer-http.repository.ts:20–23` and `data/user/user-http.repository.ts:42–45`. Repository interfaces retain `signIn` (`domain/customer/customer.repository.ts:6`, `domain/user/user.repository.ts:18`); the realm sign-in use cases call it (`sign-in-customer.usecase.ts:13`, `sign-in-user.usecase.ts:14`) and `core/providers/use-case.providers.ts:63,77` registers those use cases.
- Residual UI source: `features/identity/customer-session.component.ts:19,25`, `features/admin/user-session.component.ts:19,25` and their view files. Shared stores still implement `submitSignIn` (`customer.store.ts:123,134`, `user.store.ts:90,101`). These components have no active route in the snapshot, but the source and dependency paths remain. Removing this residual code is a separate preparatory change; it is not proof of zero external consumers.
- Legacy CSRF handling: `frontend/src/app/core/auth/auth.interceptor.ts:17,21` recognizes the two credential endpoints. The same interceptor also handles registration and authenticated realm requests; those functions must survive any login cleanup.
- Backend HTTP test consumers: `IdentityHttpIntegrationTest.kt:98,111,113,142,145,151,187,242,289,519,520,522,525`; `CommerceHttpIntegrationTest.kt:240`; `InboxApplicationWorkerTest.kt:162`; `MpOrdersCheckoutIntegrationTest.kt:319`. The commerce suites obtain a USER session through legacy login for test setup. Removal would break those consumers unless they migrate first.
- Frontend test consumers: `customer-http.repository.spec.ts:55–56`, `auth.interceptor.spec.ts:38–39`, `use-case.providers.spec.ts:64–85,108–109`, `sign-in-customer.usecase.spec.ts` and `user-role-session.spec.ts`. These cover the retained realm sign-in behavior.

## Compatible UI routes

`frontend/src/app/app.routes.ts:31–34,53,66` redirects `/customer/session` and `/user/session` to the single visual `/login`, preserving only a validated closed return destination. There are no routed legacy credential forms. `features/access/login-routes.spec.ts:5–8` verifies those redirects; `frontend/e2e/a11y.spec.ts:13,15` visits both compatibility URLs. Keeping the redirects preserves existing bookmarks and links without maintaining duplicate login flows.

`frontend/src/app/core/api/request-path.spec.ts:5` uses `/api/v1/customer/session` only as a pathname parsing example. It is not an authentication consumer.

## Documentation, OpenAPI, scripts and operations

- Current mirrors at the snapshot: `docs/agent/frontend/http-contract.md:29,44`, `specs/02-identity-user-customer.md:5,13`, `screens.md:22,36`, `ux-design-prompt.md:221,228,300` and `task-013-a11y.md:3`. This documentation cut reconciles the HTTP contract, identity spec, screens and design prompt to one `/login`, compatible redirects, supported/non-deprecated legacy HTTP and independent BlackStore identity. The accessibility note continues to describe the compatibility URLs exercised by its suite.
- Historical references: `sdd/specs/technical-spec.md:83` is superseded according to STATUS; `sdd/reviews/20260923-sol-remaining-gates.md:66` and baseline `evidence/TASK-013.md:8` record prior evidence. Older UX `screen-inventory.md:28,42`, `views-in-code/P-03-product.html:65`, `C-02-customer-register.html:24` and `stitch/U-01.html:121` are design artifacts, not executing clients. Preserve historical evidence; do not count it as proof of active traffic.
- [Unified OpenAPI](../wip/20261003-unified-access-entry/2-technical/api/unified-access.openapi.yaml) declares `/api/v1/auth/login` at line 6 and context selection. It does not declare the legacy endpoints or a deprecation marker. Its scope does not repeal baseline compatibility. Other located OpenAPI files describe BlackStore integration, not browser login.
- No matches for the four searched paths were found in `.github`, `frontend/scripts`, backend resources, `backend/pom.xml`, `frontend/angular.json` or frontend environments. No nginx, compose or deployment manifest was located. No standalone fixture/script HTTP legacy client was found in repository source.
- [Fleet operations](../features/20260921-single-tenant-installation-baseline/2-technical/fleet-operations.md) line 51 prescribes a smoke login for each realm without a concrete endpoint. The accompanying forward-looking addendum now directs artifacts containing unified access to `/login`, with separate cookies/logout, and preserves the legacy support statement. It does not authorize deploy or alter rollback compatibility for an older artifact.

## Mentioned clients and limits

README line 16 describes Universal Tools as a versioned importable profile, not a special client. README line 18 references external BlackStore; `docs/agent/frontend/runbook.md:15,17` uses a relative API base and excludes the BlackStore adapter from this frontend. The [unified ADR](../wip/20261003-unified-access-entry/2-technical/adr/ADR-001-unified-entry-separated-identities.md) excludes federation. BlackStore has separate staff identity and is not a demonstrated legacy browser-login consumer.

No mobile app, SDK or other supported legacy login client was identified inside this repository. This inventory cannot prove absence of an external consumer or an older installed frontend. README line 5 says deployment is not authorized, but that statement is not a fleet installation inventory. No live deployment, traffic inspection or credential use was performed.

## UA-007 decision at the inventory snapshot

NO-GO for HTTP deprecation/removal. The repository still contains executable legacy consumers and an explicit compatibility contract. GO for preparatory cleanup and documentation reconciliation, with redirects retained.

The [frontend coordination gate](../wip/20261003-unified-access-entry/2-technical/frontend-coordination-addendum.md) requires real-backend browser evidence for CUSTOMER-only, USER-only, a dual-realm challenge, two existing sessions, replay, expiry, isolated logout and role loss, plus proof that no supported client depends on a legacy entry.

At the inventory snapshot, the only browser suite is `frontend/e2e/a11y.spec.ts`; it mocks API responses with `page.route` at lines 38, 57 and 75. `frontend/playwright.config.ts:13` starts only Angular. `.github/workflows/verify.yml:59–61` explicitly runs a backend-less accessibility smoke, while backend tests execute separately at line 39. Those checks are useful but do not satisfy that browser gate. Any new real-backend suite and its execution evidence must be reviewed separately on the resulting head.

Before reconsidering removal: migrate or intentionally retain each executable consumer; rerun the inventory on the proposed head; record supported installation/client scope; execute the required real-backend browser matrix; obtain the independent reviews required by AGENTS.md. This document does not mark UA-007 complete or claim these future conditions have passed.
