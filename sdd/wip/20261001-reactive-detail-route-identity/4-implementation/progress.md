# Local progress — issue #142

Worktree: `C:/Users/agustin/Documents/Codex/sc-ri`.
Branch: `codex/storecore-route-identity-master`.
Base: StoreCore `master` `9b84ac86c963052baa8879fe3f0b995142dd3c66`.

The historical integration implementation was ported as an isolated diff onto
current master. Four detail containers subscribe to route identity with
deduplication and teardown. The admin order store fences GET and mutation
outcomes by route generation, preserves per-order mutation occupancy across
A→B→A and blocks commands outside the current identity. A current-generation
failure and any obsolete mutation that finishes while its identity is visible
again both trigger an authoritative refresh; obsolete response bodies never
patch the returned-to screen directly.

The port retained current-master authority and domain contracts:

- product cart reads use closed `CustomerCartAccess`, not a generic session;
- order/payment/shipment/RMA/eligibility values remain closed domain types;
- server-provided shipment/RMA actions and fail-closed eligibility are kept;
- deleted legacy component specs were not restored.

Local evidence on 2026-11-05:

- focused route/race/view suite: 26/26 PASS;
- full Angular suite: 975/975 PASS (132 files);
- the first full run exposed one unrelated order-dependent Demo test failure;
  its isolated rerun passed 2/2 and subsequent full runs passed;
- TypeScript app and spec: PASS;
- architecture: 7/7 PASS;
- ESLint: PASS;
- production build: PASS, 613.48 kB raw / 136.70 kB estimated transfer;
- `git diff --check`: PASS.

The first exact-head product review found two P2 issues: product-local gallery
state survived a SKU change, and a completed A mutation could unlock a stale A
snapshot after A→B→A. Both were fixed with actual-view coverage and an
authoritative same-identity refresh that keeps commands blocked until its GET
settles. SDD P3 evidence inconsistencies were also reconciled.

Exact-head re-review, hosted CI, PR and merge remain pending. No
homologation, deploy, provider activation or backend contract is claimed.

## Current-master close-out candidate — 2026-11-11

The implementation and its runtime tests are present in the exact tree of
StoreCore `master` `72fc4f406ec65999687d0568daa2967010b15c51`. The
close-out worktree was created directly from that SHA; no source file under
`frontend/src` was changed.

Fresh local evidence from `frontend/npm run verify`:

- architecture and surface-manifest tests: 9/9 PASS;
- ESLint: PASS;
- Angular: 174 files, 1167/1167 tests PASS;
- production build: PASS, 581.12 kB initial raw / 141.71 kB estimated transfer.

The first sandboxed attempt failed while Angular traversed paths denied by the
local sandbox. The same command, rerun with filesystem access, completed PASS;
the denied traversal is environment evidence, not a product failure.

RDI-005 is `in_review`. Two independent GPT-6.1 Sol exact-head reviews and a
hosted Verify of the final documentation head are still required. Until those
gates finish, this WIP remains unarchived and no release, provider or production
claim is made.
