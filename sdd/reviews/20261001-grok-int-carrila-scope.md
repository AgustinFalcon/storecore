VERDICT: APPROVED

# Grok 4.7 — Carril A scope on integration

**Lane:** SCOPE (independent of the SDD lane)
**Ref:** `origin/integration/storecore-int`
**SHA reviewed:** `39d6501ac7da4238df5034cac7d4e9a985e5d36d` (`39d6501`)
**Local branch at the same SHA:** `feature/int-carril-a-go-review`
**No merge.** This file does not approve GitHub, does not call hosted CI green, and does not authorize `master`, live Mercado Libre, live Mercado Pago, Correo, fiscal, the POS companion, deploy, tag, push, secrets, or `/sdd.finish`.

Carril A on `integration/storecore-int` is GO to remain on integration. Residuals below stay NO-GO.

## Gate read

- `sdd/STATUS.md` Gate actual: presentable dossier is the web store; POS companion SDD stays on `integration/storecore-int` and is not promoted to `master`. Merges named: #108 `9dc8ec6`, #109 `8924d45` (dual r2), #113 `0d20b07` (`FulfillmentCommand` accepts only the next hint), #112 `2f156eb`, #114 `10db2fb` (sealed `PaymentStatus`; MP worker uses `OrderStatus`/`PaymentStatus`), stamps #110 `081e51e` and #111 `47ca643`. Header still says the verified head is `10db2fb` and to revalidate before migrating. Tip `39d6501` is the stamp of those three merges. MP-LIVE-05, fiscal, and live stay NO-GO. Hosted jobs with `steps=[]` are not CI green.
- `sdd/wip/20260923-storecore-frontend-ux-system-v1/2-technical/homologation-lanes.md`: Carril A is the 22 web routes. Companion module stays `DISABLED` and off the console. Carril B is not deleted and does not enter `master`.
- `AGENTS.md`: physical-sale / POS companion SDD lives on `integration/storecore-int` and is not promoted to `master`. Homologation dossier is the web store only.

## Open PRs

`gh pr list --base integration/storecore-int --state open` returned no rows.

## Surface

| Check | Result |
| --- | --- |
| Companion hidden from GET capabilities | PASS. `CapabilityController.list` keeps only `InstallationCapabilityModule.visibleOnConsole`. `BLACKSTORE_INTEGRATION` is `visibleOnConsole = false`. POST state/kill paths call `requireConsoleModule` and reject a non-console wire. `JdbcCapabilityService` throws `CapabilityConfigInvalid` when an admin change targets that module. |
| Console does not print the companion product name | PASS. `frontend/src` has zero `BLACKSTORE` hits. `CapabilityModuleId` has no companion case. `ManageInstallationUseCase.listCapabilities` drops wires with `homologationVisible = false`. The capabilities table prints `moduleOf(item.module).label`. An unknown wire labels as `Módulo no disponible`. |
| Sealed `OfferStatus` / `DiscountType` | PASS. Both are sealed, with `fromWire` and `Unknown`. |
| Sealed `OrderStatus` / `ShipmentStatus` / `RmaStatus` + `FulfillmentCommand` | PASS. Ship and RMA POST persist only when the requested transition equals `FulfillmentNextAction` for the current status. `Unknown` stores nothing. |
| Sealed `PaymentStatus` | PASS. `fromWire` plus `Unknown`. Worker call sites in this range go through `OrderStatus` / `PaymentStatus`. |
| Flyway V20 | PASS for this range. Migrations on the tip stop at `V19__dsp009_blackstore_projection_causes.sql`. `git diff --name-only 9dc8ec6^..39d6501 -- backend/src/main/resources/db/migration` is empty. |
| Companion HTTP live | PASS as “not turned on by these merges”. `backend/src/main/kotlin/com/storecore/blackstore` is unchanged from `9dc8ec6^` to `39d6501`. Pre-existing `/blackstore-integration/v1` and `/api/v1/internal/admin/blackstore-companion` stay in the tree. Registry V5 leaves `BLACKSTORE_INTEGRATION` disabled. Live companion remains a residual NO-GO. |
| Secrets in this range | PASS. `git diff 9dc8ec6^..39d6501` with a secret-shaped pattern over `*.kt`, `*.ts`, `*.yml`, `*.yaml`, `*.properties`, `*.sql`, `*.env`, `*.json`, `*.html` is empty. |
| Master promotion | PASS. `39d6501` is not an ancestor of `origin/master` (`6831a135e9cb74627b995ca6f4472f757416b3f3`). `git branch -r --contains 39d6501` lists only `origin/integration/storecore-int`. |

`git diff --stat 9dc8ec6^..39d6501 -- backend/src/main` is commerce sealed types, offer/order JDBC, the MP worker, `InstallationCapabilityModule`, and `CapabilityController` (14 files, +483 / −58). No migration and no blackstore main sources.

## Validations

```text
git rev-parse HEAD
39d6501ac7da4238df5034cac7d4e9a985e5d36d

git rev-parse origin/integration/storecore-int
39d6501ac7da4238df5034cac7d4e9a985e5d36d

git status --porcelain
(clean)

git diff --check
(clean)

git log origin/integration/storecore-int -8 --oneline
39d6501 Record merge SHAs for PRs #112, #113 and #114
10db2fb Close MP payment writes behind PaymentStatus and OrderStatus
0d20b07 Apply POST ship and RMA through sealed fulfillment commands
2f156eb Close MANUAL offer writes with sealed OfferStatus and DiscountType
47ca643 Record PR #109 merge SHA 8924d45
8924d45 Close fulfillment next-action hints with sealed commerce types
081e51e Record PR #108 merge SHA 9dc8ec6
9dc8ec6 Hide the companion module from the homologation console
```

Maven was not run. Hosted CI was not treated as green.

`BLACKSTORE` search: `frontend/src` = 0. Allowed records remain in backend (`InstallationCapabilityModule`, `JdbcCapabilityService`, blackstore package, projection causes, Flyway V5–V19), backend tests, and SDD/CHANGELOG/review text. Those hits are not the homologation console.

## Dual APPROVED files

Each required file starts with `VERDICT: APPROVED`:

| Cut | SDD | SCOPE |
| --- | --- | --- |
| #108 | `sdd/reviews/20261001-grok-pr108-sdd.md` | `sdd/reviews/20261001-grok-pr108-scope.md` |
| #109 r2 | `sdd/reviews/20261001-grok-pr109-sdd-r2.md` | `sdd/reviews/20261001-grok-pr109-scope-r2.md` |
| #111 | `sdd/reviews/20261001-grok-pr111-sdd.md` | `sdd/reviews/20261001-grok-pr111-scope.md` |
| #112 | `sdd/reviews/20261001-grok-pr112-sdd.md` | `sdd/reviews/20261001-grok-pr112-scope.md` |
| #113 | `sdd/reviews/20261001-grok-pr113-sdd.md` | `sdd/reviews/20261001-grok-pr113-scope.md` |
| #114 | `sdd/reviews/20261001-grok-pr114-sdd.md` | `sdd/reviews/20261001-grok-pr114-scope.md` |
| #115 | `sdd/reviews/20261001-grok-pr115-sdd.md` | `sdd/reviews/20261001-grok-pr115-scope.md` |

The first #109 SDD pass, `sdd/reviews/20261001-grok-pr109-sdd.md`, is `VERDICT: CHANGES_REQUIRED`. It is superseded by the r2 pair above. The r2 pair is the governing #109 review.

## Residual NO-GOs

These stay NO-GO. This verdict does not clear them.

- POS companion live, companion HTTP as a product, and Carril B promotion to `master`.
- Mercado Libre live, dispatcher, competitor signals, and automatic price.
- MP-LIVE-05 and real charges. `PAYMENTS_MP` on a local walk is not a payment.
- Correo / carriers.
- Fiscal / ARCA: no emission, no DDL, no secrets.
- Flyway V20 (next free version; no file).
- Hosted CI. Recent Verify jobs with `steps=[]` are not a pass.
- `/sdd.finish`, archive to `sdd/features/`, tag, deploy, publish.
- `origin/master` stays at `6831a13`. Integration is not a master promotion.

## Gaps

None that change this verdict. `sdd/STATUS.md` still names `10db2fb` as the verified head; the branch tip is the stamp `39d6501`. Revalidate before any migration. Do not merge from this note.
