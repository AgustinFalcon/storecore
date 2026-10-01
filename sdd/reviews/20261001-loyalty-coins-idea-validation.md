VERDICT: DEFERRED_IDEA

# Terra — idea de “coins” / puntos de lealtad (validación, sin implementación)

**Fecha:** 2026-10-01. **Dueño de la idea:** Agustin. **Sin merge. Sin WIP. Sin código, DDL, Flyway, endpoint ni UI.**
**Árbol leído:** `origin/integration/storecore-int` @ `a8874ad` (*Close remaining Carril A commerce wires behind sealed types (#124)*). Carril A permanece en integración. Dossier presentable = comercio web. El companion no se promociona a `master`. MP-LIVE-05, fiscal y live siguen NO-GO.
**Issue GitHub:** [#127](https://github.com/AgustinFalcon/storecore/issues/127). Backlog: TODO-037.

## Qué pide el dueño

Las ventas online de StoreCore podrían acreditar “coins”/puntos de página. El ejemplo es un 0,10 de “cripto” según el precio, canjeable después como puntos de compra. La instalación configura: si hay umbral; la relación (ilustración: 1000 ARS → 0,01 coins, 10000 ARS → 0,10 coins); cuánto vale un coin en una promo/descuento. Registrar como pendiente. Implementar solo cuando termine el trabajo actual de Carril A / POSC / DSP. El solapamiento con otros descuentos se resuelve después.

## Evidencia leída

- `sdd/STATUS.md`: gate de Carril A en integración; checkout local deja la orden en `PENDING_PAYMENT` sin cobro MP; ML y companion apagados.
- `sdd/backlog.md` TODO-037: `[medium] [deferred] Loyalty ledger`. TODO-033 cross-sell, TODO-042 MP-LIVE-05 y TODO-020 fiscal siguen diferidos o bloqueados.
- `sdd/TRACEABILITY.md`: favorites/loyalty/carriers = TODO-036..038, sin DDL ni tarea de core.
- Baseline archivado `sdd/features/20260921-single-tenant-installation-baseline/1-functional/spec.md`: loyalty ledger fuera del core. Fiscal no oculta ni evade ventas. Sol (`sdd/reviews/20260923-sol-after-pr17-next-work.md`) prohíbe implementar loyalty por inferencia del backlog.
- Identidad: `IdentityRealm.USER` y `IdentityRealm.CUSTOMER` son rutas distintas. `orders.customer_id` referencia `customers`, no `users`.
- Pago: `PaymentStatus` sellado (`PENDING`, `APPROVED`, `REJECTED`, `CANCELLED`, `REFUNDED`, `CHARGED_BACK`, `Unknown` vía `fromWire`). `OrderStatus` sellado incluye `PENDING_PAYMENT` y `PAID`. `orders.total = subtotal + shipping_cost`, moneda `ARS`. `payments.provider` es `MERCADO_PAGO`.
- Ofertas: `offers.discount_type` es `PERCENT` o `FIXED`; `DiscountType` sellado con `Unknown`. El writer de precio de canal es `MANUAL`.
- Capacidades: el módulo `LOYALTY` existe solo como registro. `future_optional=TRUE`, acción `POST_LEDGER` (`allows_write=TRUE`), `module_configurations.state=DISABLED`. El trigger `enforce_future_optional_module_configuration` rechaza cualquier estado distinto de `DISABLED`. Hay kill switch de capacidad. No hay tabla de ledger, saldo, wallet ni canje en ninguna migración. `BLACKSTORE_INTEGRATION` no es visible en la consola.

## Dos productos distintos

**Unidades de lealtad del comercio (producto pretendido).** Puntos o “coins” de la tienda, definidos por el dueño de esa instalación: umbral, ratio ARS→unidad, valor de canje en ARS de descuento. Viven en la base de esa VM. No salen a una red, no tienen custodia, no cotizan. El apodo “cripto” del ejemplo es una metáfora de unidad fraccionaria. El spec futuro debe nombrarlo unidad de lealtad y prohibir el wire `crypto`/`wallet`.

**Criptomoneda real (NO-GO).** On-chain, exchange, custodia, wallet, stablecoin o medio de pago cripto es otro producto. Exige adapter licenciado, KYC/AML, y un GO Sol explícito. Leer “cripto” al pie de la letra abre riesgo regulatorio y de pagos. StoreCore no inventa una wallet.

## Reglas que la idea respeta solo si queda diferida

- Single-tenant: un comercio, `installation_id=1`, `scope_kind=INSTALLATION`. Sin `store_id` ni tenant routing.
- USER configura; CUSTOMER acredita y canjea. No se mezclan cuentas.
- Nada de cliente, SKU, ratio ni dominio hardcodeado. El ejemplo 1000 ARS → 0,01 es ilustración de config, no un default de código ni de Universal Tools.
- Tipos cerrados y `fromWire` → `Unknown`. La pantalla no imprime el wire crudo.
- Fail-closed de MP: `PENDING_PAYMENT` local no es una venta cobrada. Acreditar ahí premia un checkout sin pago.
- Companion fuera de `master` y fuera de este producto hasta un GO posterior.
- Fiscal: el ARS cobrado es el precio comercial. Un descuento de puntos entra en ese total visible. No hay segundo libro ni venta omitida.

## Bosquejo de spec futuro (no es un WIP)

Activar solo con GO Sol, después de Carril A / POSC / DSP, y con MP-LIVE-05 resuelto si la acreditación depende de un cobro real.

1. **Quién gana.** Un `CUSTOMER` autenticado, sobre una orden WEB ya pagada (`PaymentStatus.Approved` y un estado de orden pagado que el spec nombre). No USER. No POS / `EXTERNAL_COMPANION` salvo GO posterior. No Mercado Libre en el mismo corte.
2. **Acreditación vs canje.** Dos movimientos de ledger. Acreditar no cambia el total de esa orden. Canjear es un descuento sobre una orden posterior, con tope al payable y margen mínimo. Reversa en `REFUNDED` y `CHARGED_BACK`, idempotente.
3. **Config del dueño.** Umbral opcional, ratio (tramos o tasa), valor ARS de una unidad, política de stacking con ofertas `MANUAL` (`PERCENT`/`FIXED`). Persistida en config de instalación, versionada. El ejemplo del dueño es un caso de prueba, no el algoritmo fijo.
4. **Ledger durable.** Append-only, clave de idempotencia por orden y por tipo de movimiento, saldo derivado. Durable antes de efecto. Misma disciplina que el ledger de stock, tabla nueva; no reutilizar `inventory_ledger`.
5. **Tipos.** Unidad, estado de movimiento y política de stacking como tipo cerrado + `Unknown`.
6. **Kill switch.** El módulo `LOYALTY` ya está `future_optional` y `DISABLED`. Un GO futuro es el único que puede bajar `future_optional` y permitir `ACTIVE`. Mientras tanto `POST_LEDGER` no corre. El kill switch existente apaga escritura sin borrar historia.
7. **Qué espera a MP-LIVE-05.** El walk de Carril A crea `PENDING_PAYMENT` sin cobro. Eso no acredita. La acreditación espera un pago `APPROVED` por el camino oficial ya fail-closed, y ese camino live sigue NO-GO (TODO-042). Un doble local no sustituye el pago.

## Colisiones (resolver en el spec, no ahora)

| Tema | Por qué choca |
|---|---|
| TODO-033 cross-sell | Otro descuento con elegibilidad, stacking, prioridad, margen, snapshot y reversa. |
| Ofertas MANUAL | `PERCENT`/`FIXED` ya mueven el precio. Dos writers sobre el mismo payable exigen exclusión o orden explícito. |
| Checkout MP | El total ARS que se cobra es el de la orden. Canjear cambia ese total antes de crear el intento, con la misma idempotencia de checkout. |
| Fiscal | El adapter diferido (TODO-020) debe ver el ARS cobrado. Puntos no son una base imponible paralela ni una omisión. |
| POS companion | Venta física sigue en `integration/storecore-int` y no entra a `master`. Acreditar tickets de companion es otro GO. |
| Tenancy | Saldo y config son de la instalación única. Un SaaS futuro no se cuela en esta tabla. |

## Veredicto

**IDEA diferida.** Sigue en TODO-037 / issue [#127](https://github.com/AgustinFalcon/storecore/issues/127). No se abre WIP, no se baja `future_optional`, no se agrega V20 ni UI de coins. Carril A, POSC y DSP siguen primero. Cuando esos carriles cierren, el corte implementable es unidades de lealtad del comercio, no una wallet.

### NO-GO duros

- Criptomoneda real, wallet, exchange, custodia o liquidación on-chain.
- Implementar ahora (código, DDL, endpoint, UI, activar `LOYALTY`).
- Mezclar el canje con fiscal para ocultar o partir el total cobrado.
