# Technical specification — StoreCore initial bundle budget

## Decision

Keep the root route tree and its productive contracts intact. Replace static administration leaf-component references with Angular `loadComponent` imports. Keep the shell, layouts, login, public/customer routes, guards and root providers eager in this first cut.

## Architecture

### Route boundary

- `app.routes.ts` remains the single route manifest so existing structural tests and surface-manifest tooling continue to inspect it.
- Each productive leaf under `/user` loads its standalone component through a literal dynamic import.
- Route objects retain the exact existing `path`, `title`, `canActivate`, `canDeactivate`, redirect, `pathMatch` and order.
- No `loadChildren` branch split is allowed in this feature.

### Content leave guard

- Move `userContentLeaveGuard` from the component module into a small dedicated module.
- The guard depends on a structural interface exposing `canDeactivate(): boolean`; it must not runtime-import the editor component.
- The component retains sole responsibility for deciding whether navigation is permitted. The guard only delegates.

### Dependency-injection boundary

- `app.config.ts` and root provider lifetimes remain unchanged.
- Lazy components consume the existing root authorities; they do not re-provide sessions, access coordination, stores or repositories.

### Closed-state and SOLID compliance

- This feature does not add or translate wire/domain states.
- No string state comparison is added to view, store or test layers.
- The new guard has one responsibility: delegate route deactivation to its target contract.

## Verification

1. Capture baseline and candidate Angular production builds with `--stats-json`.
2. Candidate initial total must be `<= 700 kB`; budgets remain unchanged.
3. Route-contract tests must assert expected USER leaves use `loadComponent`, preserve guards, and keep the content leave guard.
4. Existing architecture checks, lint/type checks, unit tests and production build pass.
5. Existing access/session integration gate and GitHub CI pass on the exact PR head.
6. Independent product/bug and security reviews report no unresolved P0–P3 findings.

## Rollback

Revert the route dynamic imports and guard extraction. No persisted data, API or migration rollback is required.
