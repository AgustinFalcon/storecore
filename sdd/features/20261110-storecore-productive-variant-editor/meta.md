# StoreCore productive variant editor

- Feature: `20261110-storecore-productive-variant-editor`
- Status: `completed`
- Project mode: `brownfield`
- Branch: `codex/storecore-productive-variant-editor`
- Base: `d06c046549fd35214fa54dbeb8cb35134d3c1ab4`

## Scope

Expose the existing local product-variant update contract in the productive ADMIN catalog without changing variant identity, inventory, pricing, marketplace activation or external providers.

## Boundaries

- Existing variants only: identity and SKU remain read-only.
- Editable fields: variant name, closed publication status and open attribute key/value pairs.
- `VariantStatus.Unknown` is visible but cannot be persisted.
- No variant creation/deletion, stock mutation, Mercado Libre activation or provider claim.
- USER/CUSTOMER authority, HTTP contract and backend persistence remain unchanged.

## Precedence

This feature extends the productive catalog surface recorded by `20261108-storecore-productive-surface-data-parity`. It does not reopen or broaden external/homologation WIPs.

## Closure evidence

- Pull request: `#238`.
- Candidate: `a863a8d05aa70c302b468ed8ee175821dac7f78e`.
- GitHub Verify: run `42833927010`, 3/3 jobs successful (`backend`, `frontend`, `unified-access-real-e2e`).
- Reviews: two independent GPT-6.1 Sol medium approvals on the exact candidate, with no pending P0-P3 findings.
