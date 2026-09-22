# Sol code review — MP-LIVE-02A

**Fecha:** 2026-09-22
**Alcance:** política Kotlin pura y tests en memoria, sin wiring productivo.
**Dictamen:** GO de cierre **sólo del paquete aislado MP-LIVE-02A**; MP-LIVE-03/04/05 y pagos reales continúan NO-GO.

## Evidencia

- `backend/src/main/kotlin/com/storecore/commerce/domain/MpCheckoutAttemptPolicy.kt`
- `backend/src/test/kotlin/com/storecore/commerce/MpCheckoutAttemptPolicyTest.kt`
- `mvn -q -Dtest=MpCheckoutAttemptPolicyTest test`: 10 tests, 0 fallos, 0 errores.
- `mvn -q test`: 80 tests, 3 fallos y 1 error en `EffectivePriceConsistencyTest` e `IdentityPostMergeRegressionTest`; la suite global no está verde. Ningún fallo reportado es de MP-LIVE-02A.

## Hallazgos corregidos en la review

1. El snapshot se valida globalmente antes del replay: duplicados de número/clave, dos activos y otro intento activo se rechazan.
2. `orderId` usa el `orders.id BIGINT` local (`Long`) en la referencia determinística.
3. La ventana de búsqueda exige `from ≤ attemptCreatedAt ≤ queriedAt ≤ to`; cronologías contradictorias no vinculan.
4. La clave UUID de idempotencia entra explícitamente y no se recicla para otro intento. Timeout, errores de idempotencia y búsqueda ambigua requieren recuperación.

## Límite pendiente

`VerifiedSuccess` presupone que el futuro adapter validó identidad, importe y URL HTTPS contra hosts autorizados; el tipo por sí mismo no lo prueba. Antes de conectar persistencia, definir mapeo explícito de `ACCREDITED` y `SUPERSEDED`, que nunca son `TERMINAL_UNPAID_VERIFIED`. No se implementaron DDL, HTTP, webhook, stock, redirección ni emisión fiscal.
