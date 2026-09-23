# Política comercial de reversos y stock tardío

**Estado:** propuesta StoreCore para MP-LIVE-02; lista para revisión Sol. No autoriza worker, RMA automático ni fiscal.  
**Fuentes oficiales consultadas:** 2026-09-22 — [estados](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro-orders/payment-management/status/order-status?scope=prod), [reembolsos](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro-orders/refunds-cancellations?scope=prod).

## Mapa `status/status_detail` → efecto StoreCore (seeding)

| Remoto oficial | Efecto financiero | Orden local | Inventario | Evento verificado | Fiscal |
|---|---|---|---|---|---|
| `processed` / `accredited` + total pagado = snapshot | `payments=APPROVED` | `PAID` sólo si se consumen **todas** las líneas | consume atómico o re-reserva nueva | sí, una vez | sólo después, con gates D-01..D-07 |
| `processed` / `accredited` + reserva vencida + stock OK | `APPROVED` | `PAID` tras re-reserva+consumo completo | nuevas claves de saga/línea; no `reserve` V1 sobre `EXPIRED` | sí | igual |
| `processed` / `accredited` + stock insuficiente o consume parcial | `APPROVED` | `PAID_STOCK_REVIEW`; fulfillment bloqueado | **cero** consumo parcial | no | no |
| `created` / `processing` / `action_required` | sin cambio irreversible | sigue pendiente | reserva intacta | no | no |
| `failed` / `canceled` verificados (intento sin acreditación) | `REJECTED` / `CANCELLED` | cancela si aún `PENDING_PAYMENT` | libera reserva | evento de rechazo/cancelación | no |
| `processed` / `refunded` **o** `refunded` / `refunded` | caso `REFUND_TOTAL` `UNDER_REVIEW` | si ya `PAID`/`PAID_STOCK_REVIEW`, **no** silenciar a no-pagada | sin restock | no venta nueva; caso admin | no automático |
| `processed` / `partially_refunded` | caso `REFUND_PARTIAL` `UNDER_REVIEW` | no ajustar total de orden por inferencia | sin restock | no | no |
| Chargeback / fraude (tópico opcional o evidencia GET) | caso `CHARGEBACK` o `FRAUD` `UNDER_REVIEW` | no asumir pérdida final | detener despacho irreversible; sin restock | no | no |

Las dos formas oficiales de refund total (`processed/refunded` y `refunded/refunded`) se registran como el mismo `kind=REFUND_TOTAL`. No se elige una sola como canónica.

## Operación admin (explícita, no automática)

1. Restock sólo por RMA existente: recepción → inspección → ajuste. `JdbcOrderService.rma` hoy exige `PAID`; `PAID_STOCK_REVIEW` **no** habilita RMA ni fulfillment hasta decisión Sol.
2. Devolución financiera (refund MP) es independiente del RMA físico.
3. Cerrar un caso `UNDER_REVIEW` requiere actor USER, motivo y auditoría. No hay trigger SQL de inventario.
4. Segunda order remota acreditada → incidente `DUPLICATE_REMOTE_CREDIT`; el admin decide refund remoto, no una segunda venta.

## Stock tardío (cierre de la propuesta)

1. Lock orden + reservas + balances.
2. Si cada reserva del snapshot está `ACTIVE` y no vencida: `consumeSaga` y exigir count = líneas.
3. Si alguna expiró: nuevas `reservation_saga_key` / `reservation_line_key`; no reutilizar `JdbcInventoryService.reserve` sobre claves `EXPIRED`.
4. Stock insuficiente: en la **misma** TX, `payments=APPROVED`, orden `PAID_STOCK_REVIEW`, incidente `PAID_WITHOUT_STOCK`. No revertir el hecho financiero.
5. Falla técnica: rollback de la TX de aplicación; reintento tras nuevo GET. El inbox no se marca `PROCESSED`.

Esta política no emite ni corrige comprobantes. Fiscal consume sólo `VerifiedBusinessEvent` cuando existan gates fiscales cerrados.
