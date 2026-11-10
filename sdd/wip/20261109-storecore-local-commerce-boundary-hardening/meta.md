# StoreCore local commerce boundary hardening

- Feature: `20261109-storecore-local-commerce-boundary-hardening`
- Status: `building`
- Project mode: `brownfield`
- Proposed backlog: `TODO-047`
- Base: `64116491a5356fe15b091fe9553e30f0840fba24`
- Scope: StoreCore phase-1 local checkout and productive Angular boundaries.

## Boundaries

- No Mercado Pago, Mercado Libre, ARCA, carrier, email or BlackStore live activation.
- No repricing at checkout: the cart price snapshot remains the commercial authority.
- Existing completed checkout replays remain durable even if a product is retired later.
- No Demo fallback in the productive graph and no new provider credential.
- Finite states and commands are closed domain types; malformed structure is not an
  `Unknown` business state.

## Gate

Functional and technical specs require two independent GPT-6.1 Sol reviews before
implementation. Exact-head CI and two new final reviews are required before archive
or merge.

Specification GO: exact head `1b8236eaaba8806185d32754f9d286cbcd18d407`
received two independent GPT-6.1 Sol medium `APPROVE` reviews with no P0–P3.

Implementation T02–T06 is locally complete and awaiting exact-head code/security/UX
reviews and hosted CI. T07 remains open; no archive or merge is claimed.
