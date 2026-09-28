VERDICT: APPROVED

# Grok 4.7 — PR #28 scope (re-review)

**Lane:** SCOPE
**PR:** https://github.com/AgustinFalcon/storecore/pull/28
**Title:** Integrate the storefront mock branches
**GitHub base:** `master`
**Branch:** `integration/storefront-mock`
**GitHub head:** `eab699e6bf1ef530cf4fa86ac5e9e956f9e67014` (`gh pr view 28` state `OPEN`, `headRefOid` matches `git rev-parse HEAD`)
**Working tree included:** yes. This note judges `git diff origin/master...HEAD` (merge-base `6831a135e9cb74627b995ca6f4472f757416b3f3`) plus the uncommitted frontend and `sdd/wip/20260926-storecore-shipping-quote-sim/`. `git diff --name-only origin/master...HEAD -- backend` is empty. The uncommitted set has no `.kt` and no `.env`.
**No merge.** This file does not approve GitHub, does not call CI green, and does not authorize tag, deploy, publish, or `/sdd.finish`. The PR body was not edited.

## What was read

1. `gh pr view 28 --json title,body,baseRefName,headRefOid,state`. Demo stack. Do not merge to master. No payment, no fiscal, favorites in this browser session, promo windows do not invent prices, PR 23 stays out.
2. `sdd/STATUS.md`, including the shipping WIP paragraph.
3. `sdd/wip/20260926-storecore-shipping-quote-sim/` spec and plan.
4. The prior `CHANGES_REQUIRED` note in this file, then the checkout shipping view and store, checkout result view and container, `frontend/screenshots/mock-api.mjs`, cart and order types, `user.store.ts` `loadHome`, and the billing receipt screen.

## Closed gaps

1. `canContinue` is `lineCount > 0` plus a selected option, an address label, and coverage (`checkout-shipping.view.ts`). An empty cart renders «El carrito no tiene líneas. Esta simulación no arma un envío vacío.» The continue control in that branch is a disabled button, not the link to `/checkout`.
2. The quote label is `deliveryAddress`: the cart `addressId`, otherwise `isDefault`, otherwise the first address (`checkout-shipping.store.ts`).
3. Pending `outcome` depends on `paymentMethod`. Cash says the cash is collected at the store and does not mention Mercado Pago. Mercado Pago has its own sentence. A missing method says the screen does not choose one (`checkout-result.view.ts`). The container passes the order, so that callout renders.
4. `sampleOrder` returns `ord-1041` or `ord-1042` and null otherwise. `GET /customer/orders/:id` and `GET /user/orders/:id` send that row or 404.
5. The spec says the simulated total is not the order total and is not written to `orders.total` or `shipping_cost`. The plan calls `paymentMethod` a UI contract that does not charge. The receipt spec and screen say the form does not emit. `sdd/STATUS.md` names the shipping WIP. Checkout submit sends `idempotencyKey`, `addressId`, `currency`, and `paymentMethod` only. The billing save sends `legalName`, `taxId`, and `taxCondition`. The stand-in forces `documentStatus: 'NOT_ISSUED'`.

## Still in force

- `choose` and `mark` clear the error, then patch the selection only after the save returns. A rejected save keeps the last stored selection and sets `errorMessage`.
- A shipping read failure sets an error: cart `loadShipping`, the quote `load`, order-detail `shippingError`, and the track `load`.
- `CustomerOrder.paymentMethod` is `PaymentMethodId | null`. The mapper accepts only `MERCADO_PAGO` and `CASH`.
- Cart `load`, `loadShipping`, `loadAddresses`, and `add` clear `notice` when an error arrives. `loadHome` clears `notice` when the public home fails and still writes the operator draft from `saveHome.load()`.
- `leavesForPaymentProvider` is true only for Mercado Pago with an allowlisted URL. `checkoutAllowedOrigins` is `[]`. Cash does not assign `window.location`.

## Validation

Node `v24.19.0`. Commands run in `frontend/`.

```text
npm run check:architecture
```

Exit 0. `Architecture scan passed: Container → View → Store → UseCase → HTTP repository.`

```text
npm test -- --watch=false
```

Exit 0. The package script already passes `--watch=false`, so the log shows it twice. Vitest v4.1.11. `Test Files  42 passed (42)` / `Tests  126 passed (126)`. Duration 6.22s.

## Scope vs NO-GO

This tree does not cross a NO-GO boundary. There is no live charge, no Mercado Pago SDK, no fiscal emission, no tenancy, no secret, no Kotlin effective price, and no carrier API. Cash does not redirect. An allowlisted `checkoutUrl` remains a same-window UX redirect and, with an empty origin list, does not run.

MP-LIVE-05, fiscal/ARCA, tag, deploy, publish, and `/sdd.finish` stay refused. Do not merge this branch to `master` from this note. GitHub Verify was not treated as green.

## Gaps

None that change this verdict.

Residuals, not blocking: the disabled continue button's title still talks about location or coverage when the cart is empty or the address is missing; the callouts already say those things and the button stays disabled. A failed quote load leaves `lineCount` at 0, so the empty-cart callout can sit beside the error, and continue stays disabled. The result lede still says the screen does not confirm Mercado Pago for every method; the pending callout for cash does not. The PR body is still the older demo text. This re-review did not change it.
