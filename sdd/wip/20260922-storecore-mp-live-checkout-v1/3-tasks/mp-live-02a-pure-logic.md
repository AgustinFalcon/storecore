# MP-LIVE-02A — Lógica pura de intentos y recuperación (propuesta)

**Estado:** cerrado como paquete aislado con GO de Sol del código y 10/10 tests focalizados (2026-09-22). No cambia el `documented_deferred` del carril de pagos.

## Alcance autorizado sólo si Sol firma GO específico

Implementar valor/política pura Kotlin en `commerce/domain` y tests unitarios en memoria. Sin framework, reloj global, SQL, HTTP, SDK, secrets, configuración live, worker, webhook, inventario, estados de orden/pago, outbox o fiscal. El código no se inyecta en el checkout actual ni habilita la capability.

La política recibe snapshots explícitos, tiempo/ventana/límites por parámetros y devuelve decisiones inmutables; no ejecuta efectos. Debe cubrir:

1. Referencia determinística por `(orderId,attemptNo)` en formato `SC-{orderId}-{attemptNo}`, máximo 64 caracteres. `orderId` es el `orders.id BIGINT` local (Kotlin `Long`), no una UUID inventada. La clave UUID es **entrada explícita** provista por el caller al proponer el intento y se conserva en el snapshot; la política pura no usa generador global de UUID ni regenera la clave en retry.
2. Un solo intento activo por pedido; `CREATED`, `POSTING`, `RECOVERY_REQUIRED`, `READY_FOR_REDIRECT`, `AWAITING_RESULT` y cuarentena impiden crear otro. El hecho de acreditación financiera previa entra como **snapshot booleano explícito** provisto por el caller e impide crear otro intento, incluso si la orden quedó `PAID_STOCK_REVIEW` y no `PAID`. La política no modela ni muta estados de orden/pago. Un intento terminal impagado verificado puede permitir la propuesta de otro, nunca un timeout local.
3. Clasificación conservadora de resultado de creación: éxito vincula ID/URL sólo tras verificación del caller; timeout/5xx, `423 resource_locked`, `400 idempotency_validation_failed` y `409 idempotency_key_already_used` no emiten nueva clave ni URL y pasan a recuperación. La política no pretende implementar el parser HTTP ni la matriz final del adapter.
4. Evaluación de búsqueda remota: sólo una búsqueda con ventana válida, páginas agotadas y exactamente un candidato que coincida con referencia, merchant, aplicación, monto y moneda devuelve `BIND`; cero, múltiples, incompleta o inconsistente devuelve `RECOVERY_REQUIRED` con razón. No se elige «el primero».
   La cronología válida es `from ≤ attemptCreatedAt ≤ queriedAt ≤ to`; una consulta previa a la creación o fuera de la ventana no vincula.
5. Vincular dos veces el mismo `providerOrderId` al mismo intento es replay; uno distinto es conflicto. Ninguna decisión de recuperación acredita un pago.

Un snapshot con dos intentos activos, número o clave duplicados se rechaza antes de cualquier replay. `VerifiedSuccess` sólo representa una verificación realizada por el caller; el adapter futuro deberá comprobar la URL HTTPS contra hosts autorizados antes de usar `ReadyForRedirect` en el navegador. Esta política no habilita esa redirección.

Los estados `ACCREDITED` y `SUPERSEDED` del modelo físico propuesto no tienen mapeo en esta política aislada; el adapter deberá definirlo y obtener GO específico antes de conectarla a persistencia. Nunca se los convertirá implícitamente en `TERMINAL_UNPAID_VERIFIED`.

## Pruebas de aceptación

- Referencia y límites, UUID de entrada estable, idempotencia de retry, intento `CREATED` activo y pago acreditado aunque la orden esté `PAID_STOCK_REVIEW`.
- Timeout/423/400/409 no generan segundo intento ni URL.
- Búsqueda cero/uno/múltiples, paginación incompleta, ventana inválida y candidato con merchant/aplicación/importe/moneda discrepantes.
- Bind repetido igual versus ID remoto distinto, y cero efectos externos en tests.

**Fuera de este GO:** MP-LIVE-03/04 completos, DDL, endpoint heredado, webhook `order`/`orders_v2`, GET real, inventory expiry, refunds/chargebacks y cualquier activación. Tras implementar, Sol revisa código/tests antes de ampliar el gate.
