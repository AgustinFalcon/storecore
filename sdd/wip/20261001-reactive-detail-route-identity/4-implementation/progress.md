# Local progress — issue #142

Worktree: `C:/Users/agustin/Documents/Codex/sc-ri`.
Branch: `codex/storecore-route-identity-master`.
Base: StoreCore `master` `9b84ac86c963052baa8879fe3f0b995142dd3c66`.

The historical integration implementation was ported as an isolated diff onto
current master. Four detail containers subscribe to route identity with
deduplication and teardown. The admin order store fences GET and mutation
outcomes by route generation, preserves per-order mutation occupancy across
A→B→A, blocks commands outside the current identity and refetches authoritative
state only when a mutation of the current generation fails.

The port retained current-master authority and domain contracts:

- product cart reads use closed `CustomerCartAccess`, not a generic session;
- order/payment/shipment/RMA/eligibility values remain closed domain types;
- server-provided shipment/RMA actions and fail-closed eligibility are kept;
- deleted legacy component specs were not restored.

Local evidence on 2026-11-05:

- focused route/race suite: 23/23 PASS;
- full Angular suite: 973/973 PASS (131 files);
- the first full run exposed one unrelated order-dependent Demo test failure;
  its isolated rerun passed 2/2 and the immediate full rerun passed 973/973;
- TypeScript app and spec: PASS;
- architecture: 7/7 PASS;
- ESLint: PASS;
- production build: PASS, 613.23 kB raw / 136.69 kB estimated transfer;
- `git diff --check`: PASS.

Exact-head independent review, hosted CI, PR and merge remain pending. No
homologation, deploy, provider activation or backend contract is claimed.
