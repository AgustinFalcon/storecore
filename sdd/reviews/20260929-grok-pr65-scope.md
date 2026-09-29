VERDICT: APPROVED

# Grok 4.7 — PR #65 implementation scope

**Lane:** implementation scope
**PR:** https://github.com/AgustinFalcon/storecore/pull/65
**Title:** Keep the shipping simulation on closed statuses
**GitHub base:** `integration/storefront-mock`
**Branch:** `feature/storecore-shipping-closed-status`
**HEAD:** `c3bfd78464142c91ccce9380580cc1595846d374` (`gh pr view 65` `headRefOid` matches `git rev-parse HEAD`)
**Diff judged:** `git diff origin/integration/storefront-mock...HEAD` — 17 files, +271/−163, all under `frontend/src/app/`. No backend, no `.env`, no mock-api change.
**No merge.** This file does not approve GitHub, does not call CI green, and does not authorize tag, deploy, publish, or `/sdd.finish`.

## What was read

1. PR title and body. Closed types for the shipping option and the simulated step, `Unknown` for a wire value outside the set, paint via `MilestonePaint`, POST bodies stay codes, and `/customer/orders/:id/envio` does not write the order. Out of scope: Correo Argentino, writing the simulated price into `orders.total` or `shipping_cost`, charge, CAE, PDF, and merge to master.
2. SDD why. `AGENTS.md` closed states: private constructor, static instances, `fromWire` at the edge, views do not compare status strings, an unknown wire value is `Unknown`, and domain does not import the framework. `sdd/STATUS.md` and `sdd/wip/20260926-storecore-shipping-quote-sim/1-functional/spec.md`: the simulation does not call a carrier, does not change `shipmentStatus`, and the envío button does not write `shipmentStatus` or `tracking_code`. A carrier `statusId` this installation does not map stays `Unknown`.

## Confirmations

1. **Views do not compare status strings.** `checkout-shipping.view.ts` compares `ShippingChoice.Pickup`, `ShippingChoice.Standard`, and `ShippingChoice.Express`. The template branches on those getters and on `selectedId === option.id`. `customer-order-detail.view.ts` compares `MilestonePaint` and passes `shipping.optionId` through; it no longer calls `ShippingChoice.fromWire` on that field. `shipping-track.view.html` and the checkout template set `[attr.data-state]="step.state.code"` for CSS. That binding is not a comparison.
2. **Domain files in the diff do not import Angular.** `shipping.entity.ts`, `shipping-timeline.ts`, `shipping-quote.ts`, `shipping-coverage.ts`, and `shipping.repository.ts` have no `@angular/*` import. `ShippingSimStatus` has a private constructor, static instances, `known` without `Unknown`, and `fromWire`. The repository port still imports `rxjs` `Observable`; that import is not Angular and was already the port signature. `save-shipping-option.usecase.ts` still imports `@angular/core`. That line is unchanged context; the hunk only swaps `ShippingOptionId` for `ShippingChoice`. The sibling shipping use cases, not in this diff, use the same injectable shell.
3. **An unknown shipping status does not become Confirmed.** `ShippingSimStatus.fromWire` returns `Unknown` when the value is not one of the six known codes. The timeline spec asserts `fromWire('CADUCO')` is `Unknown`, `nextSimStatus` is null, and the painted step is that unknown status with `MilestonePaint.Current`. `mapSelection` sends a present status through `fromWire`. Only `null`, `undefined`, and `''` stay `ShippingSimStatus.Confirmed`, which is an absent status at the start of the simulated path, not an unrecognized code. `ShippingChoice.fromWire` likewise returns `Unknown`, and coverage, `pathFor`, and the quote lookup do not treat that option as estándar. The track store’s initial status is `ShippingSimStatus.Unknown`.
4. **The advance POST body is the status code string.** `ShippingHttpRepository.advance` posts `{ status: status.code }`. `save` posts `{ optionId: optionId.code }`.
5. **The envío button still does not write the order.** The button emits `advance`. The store calls `AdvanceShippingSimulationUseCase`, which only calls `repo.advance` (`POST /customer/shipping/advance`). `load` reads the order and `show` keeps `order.id`; neither writes `shipmentStatus` nor tracking. The stand-in `POST /customer/shipping/advance` updates `shippingSim` only. Customer order routes in that stand-in are reads.

## Validation

Node `v24.19.0`. Command run in `frontend/`. `--browsers=ChromeHeadless` was not passed.

```text
npx ng test --watch=false
```

Exit 0. Vitest v4.1.11. `Test Files  43 passed (43)` / `Tests  131 passed (131)`. Duration 7.34s.

## Scope vs NO-GO

This diff stays inside the shipping simulation. There is no Correo adapter, no write of the simulated price into `orders.total` or `shipping_cost`, no charge, no CAE, no PDF, and no tenancy. MP-LIVE-05, fiscal/ARCA, tag, deploy, publish, and `/sdd.finish` stay refused. Do not merge this branch to `master` from this note.

## Gaps

None that change this verdict.

Residual, not blocking: `save-shipping-option.usecase.ts` keeps its pre-existing `@angular/core` import. An absent shipping status (`null`, `undefined`, or `''`) still maps to `Confirmed`; a non-empty unrecognized code does not.
