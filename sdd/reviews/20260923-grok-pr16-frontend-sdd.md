VERDICT: APPROVED

# Grok review B — frontend + SDD + product gaps — PR #16

**Fecha:** 2026-09-23  
**PR:** [#16](https://github.com/AgustinFalcon/storecore/pull/16) `feature/mp-live-02a-pure-policy` @ `695f719`  
**Base:** `origin/master`  
**Lane:** frontend, SDD honesty, product/UX. No merge. No production-code edits.

## Why

StoreCore only marks a sale paid after a server-side, verified Mercado Pago order. This PR lands the fail-closed Orders lane (MP-LIVE-02A/02/03/04): durable attempt, official signature wrapper, persist-before-ACK, refetch by `providerOrderId`, and an optional `checkoutUrl` so the buyer can leave to Checkout Pro in the same window. Browser return and `auto_return` stay UX. MP-LIVE-05, sandbox, live credentials, POS, and fiscal stay NO-GO. The WIP stays `documented_deferred`. This review does not authorize merge, archive, or activation.

## Validations

Ran:

- `gh pr view 16`. Title/body match the fail-closed lane and leave MP-LIVE-05 and human approve unchecked. The body does not call GitHub Verify green.
- Read `AGENTS.md`, `sdd/STATUS.md`, `sdd/PROJECT.md`, `sdd/TRACEABILITY.md`, `sdd/PATTERNS.md`, the MP-LIVE WIP (`1-functional/spec.md`, `3-tasks/plan.md`, `meta.md`, `checkout-pro-orders-decision.md`), Sol re-review `20260922-sol-mp-live-03-code-rereview.md`, and Sol close-out `20260923-sol-mp-live-closeout-go.md`.
- `git log origin/master...HEAD` and `git diff origin/master...HEAD` (67 files, `695f719`). Frontend implementation read in full: `cart.entity.ts`, `http-mappers.ts`, `http-mappers.spec.ts`, `checkout-cart.usecase.ts`, `checkout-cart.usecase.spec.ts`, `cart.store.ts`, checkout page/result container and views, `cart-http.repository.ts`, customer vs user routes.
- Backend receipt path read to confirm optionality: `CheckoutReceipt.checkoutUrl: String? = null`, `JdbcCartService.withRemoteCheckout` copies a URL only when the attempt service returns a non-blank allowlisted value, and the new local receipt stays `PENDING` / `PENDING_PAYMENT`.
- Focused frontend specs: `npx ng test --watch=false` on `http-mappers.spec.ts` and `checkout-cart.usecase.spec.ts`. **6/6 PASS.**

Could not treat as green:

- GitHub checks `backend` and `frontend` on run `35796233805` are `failure` in about 2 seconds, with empty steps and no logs (`log not found`). This review does not call CI green and does not independently re-prove a billing message beyond that the jobs did not execute.
- Backend Maven suite was not re-run in this lane. Sol’s re-review already records those focused tests as PASS; this file does not upgrade that to a GitHub pass.
- No browser pass. The redirect is `window.location.assign` and the dev server was not exercised.

## Findings

No blockers.

### Confirmed behavior

- `CheckoutReceipt.checkoutUrl` is optional on the domain entity and on the Kotlin receipt (`String? = null`). `mapReceipt` stores a string or `null`. Missing URL does not invent a payment status.
- Checkout HTTP stays on `POST /api/v1/customer/checkout`. Routes `/checkout` and `/checkout/result/:orderId` use `customerGuard`. `/user/**` stays on `userGuard`. CUSTOMER and USER are not collapsed.
- Chain matches `sdd/PATTERNS.md`: checkout container → presentational view → `CartStore` → `CheckoutCartUseCase` → `CartHttpRepository`. The view emits `pay`; it does not call HTTP. Navigation sits in the ComponentStore effect, which is the project’s side-effect owner. The generic NgRx actions/effects standard is the migration target elsewhere; this screen already follows the StoreCore ComponentStore pattern, including `OnPush`.
- Same-window UX only: `window.location.assign` when `checkoutUrl` starts with `https://`. No `window.open`. Any other value falls through to `/checkout/result/:orderId`.
- That scheme check is UX only. It is not a host allowlist and it is not payment proof. The host allowlist is server-side (`MpOrdersProperties.allowlistedCheckoutUrl`) before a URL is returned. Default `adapter: unconfigured` does not register the attempt bean, so the receipt has no URL and the browser stays on the local result.
- The store does not write `PAID` or `APPROVED`. It keeps the server receipt. The use-case spec expects `paymentStatus: PENDING` beside the URL.
- Return path: `CheckoutResultComponent` loads the local customer order by path `orderId` only. It does not read `collection_status`, `status`, `payment_id`, or other return query params. The result lede says this screen does not confirm Mercado Pago.
- After accreditation the attempt leaves `READY_FOR_REDIRECT` / `AWAITING_RESULT` (`ACCREDITED` or `TERMINAL_UNPAID_VERIFIED`), so a later checkout replay does not get that URL back. A swallowed prepare failure omits `checkoutUrl` and the UI shows the local result.
- No Mercado Pago secret, access token, or public key in the frontend diff or `environment.ts`. The official adapter’s bearer token stays on the server. No favorites and no Mercado Pago SDK/Bricks in this diff.
- SDD: `meta.md` remains `documented_deferred`. `plan.md` leaves MP-LIVE-05 `Blocked`. `STATUS.md` and `TRACEABILITY.md` record 03/04 fail-closed APPROVED and 05 NO-GO. No `/sdd.finish`, no move to `sdd/features/`. CHANGELOG does not claim CI green or activation.

### Nits (do not block)

- `mapReceipt` / the store do not re-check the server host list. The spec name says “allowlisted”; the assertion only checks passthrough of one HTTPS URL and `null` when absent. That is enough for this slice because the allowlist is server-side. Do not describe the `https://` prefix as the allowlist.
- `cart.store.ts` has no spec for “HTTPS assigns, anything else goes to the result route, payment status unchanged”. Behavior was reviewed by inspection. A later store spec would lock the UX rule; it is not required to approve this HEAD.
- Checkout lede still says the browser does not talk to Mercado Pago, and the button still says «Pagar». That matches the unconfigured default, where no URL is returned. Renaming the button to «Pagar con Mercado Pago» now would promise a redirect the default adapter does not perform. Leave that label, `auto_return` back URLs, and the exact «Estamos confirmando tu pago» line for a future Sol GO of MP-LIVE-05. Do not implement them by embedding Checkout API/Bricks or by treating the return query as paid.
- `checkout-pro-orders-decision.md` still describes the pre-wiring gap (`JdbcCartService` never returns `checkout_url`). `plan.md` and `STATUS.md` are the status that matters for this PR: 03/04 are in the branch, 05 is blocked. Do not “fix” that paragraph by archiving the WIP.
- `STATUS.md` still says the closed UX plan has no Mercado Pago in the browser. Read with the next section: no SDK, credentials, or Bricks; same-window Checkout Pro lives only in this deferred WIP.

## Product / UX / SDD gaps

- MP-LIVE-05 remains NO-GO: no sandbox, no live credentials, no real end-to-end payment, no activation.
- `OfficialOrderApiAdapter.create` does not send `success_url` / `failure_url` / `pending_url` / `auto_return`. That return UX is not active. The frontend already refuses to accredit a browser return. Wiring those URLs is activation work, not a license to mark the order paid from the query string.
- Sol close-out allows a later documentary update of `STATUS.md`, `plan.md`, and `meta.md` only after merge, keeping the WIP `documented_deferred` and MP-LIVE-05 blocked. This review does not perform that close-out.
- GitHub `backend` and `frontend` are not green. Local 6/6 frontend specs do not erase that.

## Gate

APPROVED for the frontend and SDD surface of fail-closed MP-LIVE-02A/03/04 at `695f719`.

This file does not merge PR #16, does not approve GitHub, does not call CI green, and does not authorize `/sdd.finish`, moving the WIP to `sdd/features/`, MP-LIVE-05, live Mercado Pago in the browser, favorites, POS, or fiscal.
