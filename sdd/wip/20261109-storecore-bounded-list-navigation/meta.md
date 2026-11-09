# StoreCore bounded list navigation

- Feature: `20261109-storecore-bounded-list-navigation`
- Status: `implementation`
- Project mode: `brownfield`
- Backlog: `TODO-046`
- Branch: `codex/storecore-catalog-pagination`
- Scope: StoreCore phase-1 local frontend and the bounded read contract it consumes.

## Boundaries

- No DDL, provider credential, live integration, homologation or new write API.
- No fixture fallback in the productive graph.
- Page metadata is server authority; invalid metadata fails closed.
- Variant editing is a separate feature.

