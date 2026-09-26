VERDICT: APPROVED

# Grok 4.7 — PR #28 scope (r2)

**Lane:** SCOPE
**PR:** https://github.com/AgustinFalcon/storecore/pull/28
**Title:** Integrate the storefront mock branches
**State:** DRAFT, `state=OPEN`, base `master` (`6831a135e9cb74627b995ca6f4472f757416b3f3`)
**Head branch:** `integration/storefront-mock`
**SHA reviewed:** `1943fb21fd531cbd1ac23fe98d41adb2ed35f436` (`1943fb2`, `Merge the inventory read-only proof into the storefront integration.`)
**Reviewed diff:** `git diff origin/master...HEAD`. 70 files, +3055 / −97. Frontend and review notes. No `backend/` path.
**No merge.** This file does not approve GitHub, does not call CI green, and does not authorize `/sdd.finish`.

`git rev-parse HEAD` in worktree `StoreCore-pr28-scope-r2` on `feature/storecore-pr28-scope-r2` is `1943fb21fd531cbd1ac23fe98d41adb2ed35f436`. That matches `origin/integration/storefront-mock` and `gh pr view 28` `headRefOid`. `00908d5f427a8a0bbb43ab9ca5e629a02c8e994b` and `ed1b96e7adb4cf22ed70d3897008f3ef30608ee2` are ancestors. `99f6daac98844356a7dba94d703a39c9c5d8850c` (Kotlin effective price) is not an ancestor.

Prior notes `sdd/reviews/20260926-grok-pr28-scope.md` and `sdd/reviews/20260926-grok-pr28-sdd.md` approved `00908d5` and `ed1b96e`. This r2 judges `1943fb2`, including `git diff ed1b96e..HEAD` (29 files, +1001 / −166).

## What was read

1. `gh pr view 28 --repo AgustinFalcon/storecore`: title, body, base `master`, head `integration/storefront-mock` at `1943fb2`, draft. The body calls this a demo stack, says not to merge it to `master`, lists #22, #24, #25, #26, #27, and #29, and leaves #23 out. It says there is no payment and no fiscal, that favorites live only in this browser session, and that promo windows do not invent prices.
2. `sdd/PATTERNS.md` frontend path: Container → view → ComponentStore → use case → HTTP repository. CUSTOMER and USER do not share a cookie. The browser does not store a Bearer token. Base, desired, observed, and effective stay distinct prices.
3. `sdd/wip/20260923-storecore-frontend-ux-system-v1/1-functional/screen-inventory.md`: the 22 routes P-01…P-03, C-01…C-09, U-01…U-10. Favoritos is listed outside that inventory.
4. Full `git diff --stat origin/master...HEAD` and the product diff `ed1b96e..HEAD` for capabilities, operator price columns, Mercado Libre empty map, order snapshot strike, fulfillment next action, checkout result, and inventory.
5. `frontend/src/app/app.routes.ts` on this tip.

## SDD why

This branch is a storefront mock stack for a walkthrough. It is not a master merge. The surfaces already approved on `00908d5` remain: catalog query string, session favorites, public home banner list with a re-read after publish, and the offer-window badge. Commits after `ed1b96e` add read-only proofs on the existing operator and customer screens. They do not add a backend, a payment screen, a BlackStore route, or a Kotlin effective-price module.

## Diff since the prior approval

Product paths in `ed1b96e..HEAD`:

- `user-capabilities.component.ts`, `user-capabilities.view.html`, `user-capabilities.view.ts`: the container no longer binds `changeState`. Each state button is `disabled`, has no click handler, and uses the title “Esta instalación no prende capabilities desde la consola.”
- `user-catalog.view.html` / `user-catalog.view.ts`: the operator table shows Base, Desired, Observed, and Efectivo as separate cells. Observed and Efectivo inputs are `readonly`. The note on the form says the storefront sells the effective price.
- `user-mercadolibre.view.html` and `installation.store.ts`: `listings` starts as `null`. The empty map sentence renders after a finished load that returned an array of length 0. A failed load leaves `listings` null.
- `line-discount.ts` plus the customer order list and detail views: a struck original appears only when `discountAmount > 0` and `originalUnitPrice > effectiveUnitPrice`. The line still shows the snapshot effective price. Missing numbers do not become a discount.
- `fulfillment.view.spec.ts` and `user-order-detail.view.spec.ts`: each row and the order detail expose one next ship action and one next RMA action. “Ajustar stock” is that next RMA label when the order is `DELIVERED` and the RMA is `INSPECTED`. It is not a quantity editor.
- `user-inventory.view.spec.ts` against the existing inventory view: Disponible, Reservado, and Safety are text. The view has no input, textarea, or select. The container calls `loadInventory()` only.
- `checkout-result.component.spec.ts`: init and reload call `load` with the path `orderId`. Return query params `collection_status`, `status`, `payment_id`, and `payment_status` are not passed in.
- `product-page.view.html`: the signed-out line is “Entrá para agregar al carrito”. The hero price remains `product.price.effective`.
- `profile-import.view.html`: the lede says the manifest cannot bring secrets or rewrite history.

`mapProductSummary` still sets the tile `price` from API `effective` and sets `originalPrice` only when the payload base is already higher. `CatalogStore.search` and `loadProduct` still map with `withoutClosedOfferBadge`. Those files are unchanged in `ed1b96e..HEAD`.

`InstallationStore.changeCapability` still calls `setCapability`, and the view still declares a `changeState` output. Nothing in `frontend/src` calls `changeCapability` except that effect’s own definition. The capabilities screen does not emit it.

## Screen coverage

The 22 inventory routes are still the routes in `app.routes.ts`. `/customer/favorites` is the extra browser mock. CUSTOMER routes use `customerGuard` where the inventory says so. USER console routes use `userGuard`. Session components stay unguarded.

| ID | Route | On `1943fb2` |
| --- | --- | --- |
| P-01 | `/` | Home component. Unchanged in `ed1b96e..HEAD`. Offer rail and banner list stay the prior stack. |
| P-02 | `/catalog` | Query string and window-aware Oferta badge stay the prior stack. Tile price is mapped effective. |
| P-03 | `/catalog/:sku` | Hero price is effective. Base is the struck comparison only when `base > effective`. Signed-out link goes to `/customer/session`. |
| C-01 | `/customer/session` | Customer login. Unchanged in this delta. |
| C-02 | `/customer/register` | Register. Unchanged in this delta. |
| C-03 | `/customer/profile` | Guarded profile. Unchanged in this delta. |
| C-04 | `/customer/addresses` | Guarded addresses. Unchanged in this delta. |
| C-05 | `/cart` | Guarded cart. Unchanged in this delta. |
| C-06 | `/checkout` | Guarded checkout. The page lede says the browser does not talk to Mercado Pago. This delta does not add a payment view. |
| C-07 | `/checkout/result/:orderId` | Guarded. Loads the path id through `CustomerOrderDetailStore`. Return query params stay off that call. |
| C-08 | `/customer/orders` | Guarded. Lede says the order and the payment are separate. Struck original only for a real line discount. |
| C-09 | `/customer/orders/:id` | Guarded snapshot. Same discount rule. Read-only. |
| U-01 | `/user/session` | Operator login. Unchanged in this delta. |
| U-02 | `/user/content` | Title and body publish, public banner list. Unchanged in this delta. |
| U-03 | `/user/catalog` | Four price columns. Observed and effective stay read-only on the form. |
| U-04 | `/user/promos` | MANUAL window. Unchanged in this delta. |
| U-05 | `/user/orders` | One next ship button and one next RMA button per row. |
| U-06 | `/user/orders/:id` | The same single next ship and single next RMA on the order summary. |
| U-07 | `/user/inventory` | Read-only counts. No stock-write control. |
| U-08 | `/user/mercadolibre` | Account and listing map. Empty map copy only after a completed empty load. |
| U-09 | `/user/capabilities` | Five states visible. Buttons disabled. The container does not flip module state. |
| U-10 | `/user/profile-import` | Preview and merge. Lede refuses secrets and historical rewrite. |
| — | `/customer/favorites` | Guarded extra route. `sessionStorage` key `storecore.ui.favorites`. The page says the list lives only in this browser. `customer-layout.component.html` has no favorites link. |

No BlackStore route. No Mercado Pago result screen. No inventory quantity write.

## Scope checks

| Check | Result |
| --- | --- |
| Container → view → ComponentStore → use case → HTTP repository | PASS. `npm run check:architecture` passed. New views import the pure `hasRealLineDiscount` helper. They do not import `HttpClient`, `UseCase`, or `ComponentStore`. |
| NgRx global store | Not requested. This tip keeps ComponentStore. |
| HTTP or UseCase inside a `*.view.ts` | PASS on the architecture scan. |
| Domain importing Angular | PASS. `line-discount.ts` is a plain function. The scan passed. |
| Bearer in the browser | PASS. This delta does not add `Authorization`. Existing interceptor specs still expect no `Authorization` header. |
| Fixtures in `app.config` | PASS. `app.config.ts` is outside this compare. The scan rejects `InMemory` and `Fixture` there. |
| CUSTOMER / USER session mix | PASS. Checkout result uses the customer order store. Capabilities, inventory, and Mercado Libre stay on the user installation store. |
| Storefront selling base or observed | PASS. The tile sells mapped effective. The product page hero is effective. Operator columns label the four prices apart. |
| Capability console that flips module state | PASS. The live screen does not call `setCapability`. |
| Inventory stock write | PASS. `/user/inventory` renders text counts and reloads on Reintentar. |
| Mercado Pago UI | PASS. The result component ignores return query params. This compare does not add a payment SDK view. |
| BlackStore routes | PASS. No `blackstore` string under `frontend/src`. |
| Kotlin effective price (#23) | PASS. No backend diff. `99f6daa` is not an ancestor. |

## Validations

Worktree `C:\Users\agustin\Desktop\StoreCore-pr28-scope-r2`, HEAD `1943fb21fd531cbd1ac23fe98d41adb2ed35f436`. Node `v24.19.0`. `frontend/node_modules` was absent, so it was a junction to `C:\Users\agustin\Desktop\StoreCore-storefront-mock\frontend\node_modules` (that worktree is the same SHA). The junction is not committed. No `npm install`.

```text
cd frontend
npm run check:architecture
npm test -- --watch=false
```

| Command | Result |
| --- | --- |
| `npm run check:architecture` | Exit 0. `Architecture scan passed: Container → View → Store → UseCase → HTTP repository.` |
| `npm test -- --watch=false` | Exit 0. Vitest v4.1.11. `Test Files  38 passed (38)` / `Tests  113 passed (113)`. Duration 8.69s. Local run. |

GitHub Verify run [36251112372](https://github.com/AgustinFalcon/storecore/actions/runs/36251112372) on `1943fb2` (`pull_request`):

| Job | Result |
| --- | --- |
| `backend` `108429196520` | `failure`. Started `2026-09-26T15:12:16Z`, finished `2026-09-26T15:12:18Z`, `steps: []`. |
| `frontend` `108429196625` | `failure`. Started `2026-09-26T15:12:16Z`, finished `2026-09-26T15:12:18Z`, `steps: []`. |

Both failure annotations say the job was not started because recent account payments failed or the spending limit needs to be increased. Neither job executed a test suite. That is not a green check and it is not evidence the suite failed in CI.

## Gaps since `00908d5`

None that change this verdict.

Non-blocking. `changeCapability` remains on `InstallationStore` and `changeState` remains on the view type. The capabilities template does not call them. `user-capabilities.view.spec.ts` checks the five state names and the title string; it does not render the disabled buttons. The template and the container are what keep the console from flipping a module. `/customer/favorites` is still outside the 22-route inventory and still this browser session only.

## Residual NO-GO

This stack stays a demo branch. Do not merge it to `master` from this note. Fiscal/ARCA, MP-LIVE-05, a payment SDK, live companion, BlackStore calls, Bearer tokens, tenancy, a live price cron, Kotlin effective price, secrets, tag, deploy, publish, and `/sdd.finish` stay unauthorized. Verify run `36251112372` is not CI green.
