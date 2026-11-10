# StoreCore initial bundle budget

- Feature: `20261110-storecore-initial-bundle-budget`
- Status: `implementation`
- Project mode: `brownfield`
- Branch: `codex/storecore-initial-bundle-budget`
- Scope: StoreCore frontend route composition and production bundle only.

## Baseline

- Master candidate: `7185f43fc01e15c14d0b1deb1dd2a46e7222cb2e`.
- Production initial bundle: `774.07 kB` (`754.56 kB` JS + `19.52 kB` CSS).
- Existing warning budget: `700 kB`; existing error budget: `900 kB`.

## Boundaries

- Do not raise or remove bundle budgets.
- Do not change URLs, route order, guards, titles, redirects, providers or session semantics.
- Do not change backend contracts, domain state models, UI content or visual behavior.
- Do not add preloading or duplicate root providers in lazy injectors.
- Preserve the content editor deactivation contract for clean, dirty and saving states.
- No finite state, role, payment method or flow-step representation is introduced or changed.

## Affected specs

- Overrides: none.
- Extends: none.
- Deprecates: none.

## Validation to date

- Local architecture: `9/9` passing.
- Local lint: passing.
- Local unit tests: `167` files, `1129` tests passing.
- Candidate production initial bundle: `572.76 kB`, under the unchanged `700 kB` warning budget.
- Independent Bugbot and Security reviews: `APPROVE`, no P0-P3 findings.
