# Safe stock adjustment

StoreCore now exposes a dedicated administrator flow for changing only a variant's available stock through an idempotent delta command. The implementation preserves reserved and safety quantities, compares the full expected snapshot, and writes an immutable command receipt together with its ledger and audit effects.

The Angular flow models phases and wire outcomes as closed domain types, persists the frozen attempt before transmission, blocks a second unresolved adjustment globally and provides explicit recovery after an uncertain response. Existing catalog updates can no longer bypass the command by overwriting stock.

## Delivery evidence

- PR: `#240`.
- Candidate: `614c027df2a25709996b23fa99b02178e6ff8b27`.
- GitHub Verify run `42879363994`: 3/3 successful.
- Backend: 291 tests successful.
- Frontend: architecture, lint, 1,165 tests and production build successful.
- Real browser: 22/22 against the packaged backend and fresh PostgreSQL 16.
- Independent Bug/Product and Security reviews: approved with no open P0-P3 findings.

## Explicit non-goals

This cut does not synchronize Mercado Libre, BlackStore, POS or other providers, does not create missing balances, and does not add bulk or physical-count workflows.
