# POSC-003 — subcortes revisables de catálogo y reserva

**Estado:** plan documental. Spec prv16 dual APPROVED. **NO-GO de código** hasta el PR de cada slice. Head al redactar: `8e2a47f` (V1–V10). Pin OpenAPI `7B907...DE30` intacto. `BLACKSTORE_INTEGRATION` DISABLED.

## Secuencia y reglas de PR

Orden obligatorio **003A → 003B → 003C → 003D → 003E**. Un PR por slice a `integration/storecore-int`. Cada PR: evidencia PG16 local + dos reviews Grok 4.7 (`sdd/reviews/`). No dos Maven a la vez. No frontend deps. No `sdd.finish`. ML-DSP-000B no ocupa el número Flyway de 003A y no bloquea este DAG.

## POSC-003A — revisión de catálogo, audit port y triggers (SQL)

- **Estado:** dual Grok 4.7 código APPROVED (`sdd/reviews/20260930-grok-prv17-sdd.md`, `prv17-scope.md`). V11 SHA-256 LF `39CAEFFD984446407687A2A351A93EB892179DE39C022ABB74DE1302F7287DC1`. Local `Posc003aCatalogRevisionTest` 5/5.
- **Dependencia:** dual spec APPROVED. Siguiente versión Flyway libre (p.ej. `V11` si `flyway_schema_history` lo confirma); no reescribe V1–V10 ni capability.
- **Ownership:** singleton `blackstore_catalog_revision`; triggers INSERT/UPDATE/DELETE en `products`, `product_variants`, `product_images`, `offers`, `offer_products`, `installation_settings`. Trigger: `UPDATE … SET revision=revision+1 WHERE id=1` (row lock) antes de completar el writer. `blackstore_catalog_revision_share()` SECURITY DEFINER (PG exige UPDATE para `FOR SHARE`; runtime no recibe UPDATE directo). Función `storecore_blackstore_audit_override` (`search_path=pg_catalog, pg_temp`) para `BLACKSTORE_PRICE_OVERRIDE` y `BLACKSTORE_CATALOG_SKU_EXCLUDED`. Runtime sin `INSERT` directo a `audit_events`.
- **Aceptación:** writers estáticos incrementan revisión; rollback no deja revisión espuria; `inventory_balances` no dispara revisión; checksum pinneado; BLACKSTORE DISABLED; limpia + upgrade; preflight SKU >64 audita un evento por revisión. Prueba PG16 de deadlock/timeout: writer WEB + GET + Tx-B dummy + Tx-C capability concurrente no invierte locks.

## POSC-003B — `catalogVersion` / `priceVersion` y `PriceQuotePort`

- **Estado:** merge `#76` (`06a85e2`). Dual Grok 4.7 código APPROVED (`sdd/reviews/20260930-grok-prv18-sdd.md`, `prv18-scope.md`).
- **Dependencia:** 003A mergeado (`6cc7ffa`).
- **Ownership:** tipos cerrados `c1_`/`p1_`; un `PriceQuotePort`. Refactor de `JdbcEffectivePriceQueryAdapter` y filtro de ofertas en `CatalogService` al intervalo canónico `[starts_at, ends_at)` (`starts_at <= asOf < ends_at`). Storefront y POS/Tx-B usan el mismo selector.
- **Aceptación:** oferta vigente = storefront; `asOf == ends_at` no aplica la oferta; empate `priority DESC,id ASC`; includeCost fail-closed; `COST_SCOPE_REQUIRED` no se emite.

## POSC-003C — cursor opaco, fotografía y ETag

- **Estado:** merge `#77` (`21780e4`). Dual Grok 4.7 APPROVED (`sdd/reviews/20260930-grok-prv19-sdd.md`, `prv19-scope.md`).
- **Dependencia:** 003B mergeado (`06a85e2`).
- **Ownership:** columnas aditivas V6 (`last_variant_id`, `page_size`, `visibility_digest`, `format_version`, `issued_at`); `blackstore_catalog_page_snapshots`; `blackstore_price_quotes`; ETag `e1_`. Un handler `GET /catalog`. Lazy delete de snapshot/quote vencidos **después** de 200/304/410. Máx. 3 generaciones vivas por clave. Advisory lock: el perdedor reutiliza la fila ganadora.
- **Aceptación:** cursor LEGACY/manipulado/cruzado → 410; pageSize 0/201 → 400; stock cambia ETag sin invalidar `catalogVersion`; 304 sólo fotografía viva; `visibility_digest` y `format_version` persistidos y verificados.

## POSC-003D — stock read

- **Estado:** merge `#78` (`eb59fb7`). Dual Grok 4.7 APPROVED (`sdd/reviews/20260930-grok-prv20-sdd.md`, `prv20-scope.md`).
- **Dependencia:** 003C mergeado (`21780e4`).
- **Ownership:** un handler `GET /stock/variants/{variantId}`.
- **Aceptación:** ausente 404; SKU 65..128 → 404; inactivo visible en catálogo con `active=false` pero stock read reporta sellable físico; reserve no confía en cantidad de catálogo.

## POSC-003E — reserva Tx-A/Tx-B y hash H2

- **Estado:** implementación local en `feature/posc003e-reserve-h2`. V13 `request_hash_algorithm` DEFAULT H1, nuevas reservas H2, PENDING vivo <60s aborta migrate. `DUPLICATE_VARIANT`/`LINE_VALIDATION_FAILED` ya no se emiten. Override vía `storecore_blackstore_audit_override` + scope `price:override`. Dual Grok prv21 pendiente.
- **Dependencia:** 003D mergeado (`eb59fb7`).
- **Ownership:** un handler `POST /reservations`. ALTER aditivo `blackstore_integration_operations.request_hash_algorithm DEFAULT 'H1'` (mismo Flyway 003E o delta si 003A ya cerró el número). Hash H2, drain H1 sobre `blackstore_integration_operations` según runbook de la propuesta, taxonomía YAML exacta, override vía función 003A.
- **Aceptación:** envelope `priceVersion` vacío → 400 pre-Tx-A; una cuádruple, una reserva/ledger por variante; crash A→B recupera PENDING; códigos `LINE_VALIDATION_FAILED`/`DUPLICATE_VARIANT`/`COST_SCOPE_REQUIRED` no se emiten (`includeCost` → `FORBIDDEN` o `CAPABILITY_DISABLED`); override ALLOWED/DENIED auditado; catálogo stale con precios de línea vigentes **sigue** exigiendo override; PENDING H1 vivo aborta migrate.

## Fuera de este DAG

Commit/release/GET/reconcile (004), worker/purge batch (004A), PIC-006A (006), ML RR, fiscal, conector live, grant `INSERT(variant_id)`, `sdd.finish`.
