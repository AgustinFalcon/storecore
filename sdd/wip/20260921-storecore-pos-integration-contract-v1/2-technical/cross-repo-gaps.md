# Gaps canónico StoreCore vs BlackStore

**Canónico:** `2-technical/api/blackstore-integration.openapi.yaml` (`1.0.0-draft`).

**Draft BlackStore 0.0.0:** superseded. El puntero BlackStore es Markdown (`storecore-pos-integration-contract-v1.md`), no un segundo YAML.

| # | Tema | Resolución (cerrada) |
|---|---|---|
| a | Headers Installation-Ref / Idempotency-Key | Cuádruple canónica |
| b | `/api/v1` + `/pos-integration` | Solo `/blackstore-integration/v1` (D-PATH; sin slash final) |
| c | Linea solo sku | `variantId`+`sku` |
| d | Estados UNKNOWN / required expiresAt | OperationReceipt oneOf: PENDING vs durable (receipt/ref/accepted min 1) |
| e | Sin reconcile/cursor | Reconcile intersección 500; cursor 200/7d; tombstone 410 OPERATION_RETIRED |
| f | CatalogSnapshot free-form | Item tipado; `availableQuantity` neta de safety; available ya descuenta reserved |
| g | GET sin device/sale | GET exige cuádruple |
| h | ISSUE/oversell pos-core | WIP `blackstore-pos-core` **superseded**; vivo = `blackstore-pilot` |
| i | `aggregate_operation_key` sola | Derivada/enforced `= operation_id`; outbox persiste path/version/digest/hash |
| j | Two OpenAPI | Un YAML canónico StoreCore |
