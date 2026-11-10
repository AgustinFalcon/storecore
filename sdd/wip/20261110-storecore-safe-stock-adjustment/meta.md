# StoreCore safe stock adjustment

- Feature: `20261110-storecore-safe-stock-adjustment`
- Status: `specified`
- Project mode: `brownfield`
- Branch: `codex/storecore-safe-stock-adjustment`
- Base: `2e9452eb31c96a8c81a38ef0a98f2ee5d216c631`

## Scope

Add a dedicated, idempotent and concurrency-safe available-stock adjustment command plus a complete administrator UX. The command changes only reservation-netted `available`, preserves `reserved` and `safety`, records an immutable receipt, ledger and audit event, and supports honest recovery after an unknown network outcome.

## Boundaries

- Local StoreCore inventory only; no Mercado Libre, POS, provider or physical-count synchronization.
- One existing variant per command; no implicit balance creation.
- Signed delta is the only editable quantity mode in this cut.
- Catalog edits may not mutate stock for existing variants after this feature.
- No deploy, live credentials or homologation.

## Supersession

This feature supersedes only the Real inventory read-only clauses in the commercial UX hardening SDD. Demo physical/not-sellable inventory semantics remain separate and unchanged.
