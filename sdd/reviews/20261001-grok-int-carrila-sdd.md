VERDICT: APPROVED

# Grok 4.7 — Carril A stay on integration (SDD lane)

**Lane:** SDD
**Branch:** `feature/int-carril-a-go-review` tracking `origin/integration/storecore-int`
**HEAD judged:** `39d6501ac7da4238df5034cac7d4e9a985e5d36d` (`39d6501`) — *Record merge SHAs for PRs #112, #113 and #114*
**No merge.** This file does not approve GitHub, does not call hosted CI green, and does not authorize `/sdd.finish`, deploy, tag, secrets, publish, live Mercado Pago, live Mercado Libre, fiscal/ARCA, companion live, or promotion to `master`.

Carril A (closed commerce types and the homologation console that hides the POS companion) may stay on `integration/storecore-int`. That is the only GO in this file.

## What was read (required order)

1. `sdd/STATUS.md` Gate actual + Residuales. Gate: dossier presentable = comercio web toward `master`; companion SDD stays on `integration/storecore-int` and is not promoted. Walk A keeps ML and the POS companion off; the console does not list the companion module. MP-LIVE-01–04 stay fail-closed and `documented_deferred`. The status line still names the payment feature tip `10db2fb`; the branch tip that records that stamp is `39d6501`.
2. `CHANGELOG.md` Unreleased: #108 `9dc8ec6`, #109 `8924d45`, #113 `0d20b07`, #112 `2f156eb`, #114 `10db2fb`. Explicitly no release, tag, deploy, vendor credentials, POS adapter, or fiscal/ARCA.
3. `sdd/TRACEABILITY.md` rows: homologation FE↔BE, fulfillment next-action hints, MANUAL offer writes, MP payment writes. Same SHAs. MP-LIVE-05 remains NO-GO.
4. `sdd/wip/20260923-storecore-frontend-ux-system-v1/2-technical/homologation-lanes.md`. Carril A = 22 web routes, cookie + proxy. Carril B stays on integration and in the companion repo. `PAYMENTS_MP=ACTIVE` is a checkout claim only; the adapter stays unconfigured.
5. `AGENTS.md`. Single-tenant. Physical sale and fiscal stay external. Companion SDD is not promoted to `master`.

## Why

Carril A is the web-commerce homologation dossier. The companion SDD remains on `integration/storecore-int` and never promotes to `master`. Closed domain: Kotlin `sealed` (or a private-constructor type with one `fromWire`) plus `Unknown`. The view speaks labels, not raw companion wire.

## Merged feature diffs and dual Grok files

`git log origin/integration/storecore-int -8 --oneline`:

```text
39d6501 Record merge SHAs for PRs #112, #113 and #114
10db2fb Close MP payment writes behind PaymentStatus and OrderStatus
0d20b07 Apply POST ship and RMA through sealed fulfillment commands
2f156eb Close MANUAL offer writes with sealed OfferStatus and DiscountType
47ca643 Record PR #109 merge SHA 8924d45
8924d45 Close fulfillment next-action hints with sealed commerce types
081e51e Record PR #108 merge SHA 9dc8ec6
9dc8ec6 Hide the companion module from the homologation console
```

Ancestors of HEAD: `9dc8ec6`, `8924d45`, `2f156eb`, `0d20b07`, `10db2fb`. Working tree porcelain empty.

| PR | Merge SHA | Approving pair on this tree |
|---|---|---|
| #108 hide companion | `9dc8ec6` | `sdd/reviews/20261001-grok-pr108-sdd.md`, `sdd/reviews/20261001-grok-pr108-scope.md` — both `VERDICT: APPROVED` |
| #109 fulfillment hints | `8924d45` | r2 `sdd/reviews/20261001-grok-pr109-sdd-r2.md`, `sdd/reviews/20261001-grok-pr109-scope-r2.md` — both `VERDICT: APPROVED`. r1 SDD (`20261001-grok-pr109-sdd.md`) is `CHANGES_REQUIRED` and was superseded by the sealed-class r2 that landed in the merge |
| #112 offer writes | `2f156eb` | `sdd/reviews/20261001-grok-pr112-sdd.md`, `sdd/reviews/20261001-grok-pr112-scope.md` — both `VERDICT: APPROVED` |
| #113 POST ship/RMA | `0d20b07` | `sdd/reviews/20261001-grok-pr113-sdd.md`, `sdd/reviews/20261001-grok-pr113-scope.md` — both `VERDICT: APPROVED` |
| #114 payment writes | `10db2fb` | `sdd/reviews/20261001-grok-pr114-sdd.md`, `sdd/reviews/20261001-grok-pr114-scope.md` — both `VERDICT: APPROVED` |
| #115 SHA stamp | `39d6501` | `sdd/reviews/20261001-grok-pr115-sdd.md`, `sdd/reviews/20261001-grok-pr115-scope.md` — both `VERDICT: APPROVED` (reviewed the pre-merge stamp commit; the squash on integration is `39d6501`) |

Diff stats (no Flyway, no secrets): #108 console hide + closed FE types; #109 `OrderStatus` / `ShipmentStatus` / `RmaStatus`; #112 `OfferStatus` / `DiscountType` into `JdbcOfferService`; #113 `FulfillmentCommand` into `JdbcOrderService.ship` / `rma`; #114 `PaymentStatus` into the MP worker; #115 docs only (`CHANGELOG.md`, `sdd/STATUS.md`, `sdd/TRACEABILITY.md` plus the two #115 review files).

Checked at HEAD:

- `PaymentStatus`, `OfferStatus`, `DiscountType`, `OrderStatus`, `ShipmentStatus`, `RmaStatus`, `ShipmentTransition`, `RmaTransition` are sealed, `fromWire`, `Unknown`.
- Create offer rejects non-writable status and `DiscountType.Unknown`. POST ship/RMA persist only `FulfillmentCommand` stored status; mismatch throws `FulfillmentRejected`. MP worker writes `PaymentStatus.Approved` / `forUnpaidTermination` and `OrderStatus.Paid` / `PaidStockReview` / `Cancelled`.
- `InstallationCapabilityModule.fromWire("BLACKSTORE_INTEGRATION")` is not `visibleOnConsole`. GET `/api/v1/user/capabilities` filters that flag. POST state/kill calls `requireConsoleModule`. The Angular console lists `homologationVisible` modules and renders `label`, not the companion wire.

## Validations

- `git log -1`: `39d6501ac7da4238df5034cac7d4e9a985e5d36d`.
- `git status --porcelain`: empty. `git diff --check origin/integration/storecore-int`: empty.
- `gh pr list --base integration/storecore-int --state open --json number,title,state`: `[]`.
- Maven was already running the requested suite (`java` pid 55420, `-Dtest=OfferWriteTypesTest,FulfillmentCommandTest,FulfillmentNextActionTest,PaymentStatusTest,InstallationCapabilityModuleTest`). A second Maven was not started. After that process exited, Surefire reports written `2026-10-01T02:40:03-03:00` show 5 suites, 15 tests, 0 errors, 0 failures, 0 skipped (`OfferWriteTypesTest` 3, `PaymentStatusTest` 3, `FulfillmentCommandTest` 4, `FulfillmentNextActionTest` 4, `InstallationCapabilityModuleTest` 1). This is local Surefire only. Hosted CI is not a pass.

## Residual NO-GOs (unchanged)

- Fiscal / ARCA: `documented_deferred`. No DDL, emission, or secrets.
- Companion live and BlackStore connector: module stays `DISABLED` except temporary tests. Carril B is not the homologation dossier and is not promoted to `master`.
- Dispatcher ML: outbox local only. No live Mercado Libre, competitors, or automatic price.
- MP-LIVE-05 and real charges. `PAYMENTS_MP=ACTIVE` is not a payment proof.
- `/sdd.finish` and WIP archive. Implementable MP-LIVE-01–04 stay `documented_deferred`.
- POSC `INSERT(variant_id)` runtime remains false (`slices_complete_residuals`).
- TASK-LT5-005 hosted close gates. Hosted Verify jobs that ended `steps=[]` are not green CI.
- Promote integration to `master`. Revalidate head before any future web-only promotion. No tag, deploy, or publish.

## Gaps

No implementable Carril A gap. r1 of #109 asked for sealed classes; r2 APPROVED and the merge contains those types. `sdd/STATUS.md` still says the integration tip was verified at `10db2fb`; that is the payment feature SHA the stamp recorded. The tip that holds the stamp is `39d6501`.
