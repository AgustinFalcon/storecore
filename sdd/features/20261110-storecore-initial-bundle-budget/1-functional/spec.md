# Functional specification — StoreCore initial bundle budget

## Objective

The public StoreCore entry point must load within the existing production warning budget without changing any buyer or administrator workflow. Heavy administration screens must be fetched only when their existing route is activated.

## User stories

### F-01 — Fast public entry

As a visitor, I can open StoreCore without downloading the implementation of administration screens that I did not request.

Acceptance criteria:

- The production initial bundle is at or below `700 kB` without changing the configured budget.
- The initial public shell, public catalog and login behavior remain available.
- No administration leaf component is part of the initial JavaScript graph solely because it is declared in the root route table.

### F-02 — Unchanged administrator navigation

As an authenticated USER, I can navigate directly or through the UI to every existing administration route with the same title, guard and result.

Acceptance criteria:

- Existing `/user/**` paths, redirects, route ordering and titles are unchanged.
- Anonymous and cross-realm access still follow the existing authorization and return-destination behavior.
- Refresh and direct navigation load the requested administration screen.
- No new loading screen, copy change or visual redesign is introduced by this feature.

### F-03 — Protected content editing

As an administrator editing content, I retain the existing protection against losing unsaved or in-flight changes after the editor becomes lazy-loaded.

Acceptance criteria:

- Clean content allows navigation.
- Dirty content uses the existing confirmation contract and honours cancel/confirm.
- Saving content remains protected by the existing component contract.
- The route guard is importable without eagerly importing the content editor implementation.

## Out of scope

- Customer-route restructuring, provider-scope changes, preloading and service-worker caching.
- Backend or database work.
- UI redesign, mocks, new functionality or changes to closed domain states.
