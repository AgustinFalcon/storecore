# Especificación técnica — trazabilidad brownfield #8/#13

## Autoridades ejecutables

### Fulfillment

- `backend/src/main/kotlin/com/storecore/commerce/domain/Delivery.kt` define
  `PICKUP`, `LOCAL_DELIVERY`, `UNKNOWN` y reglas de precio/dirección.
- `ManualFulfillmentPolicyController` publica la configuración versionada con
  autorización, CAS y CSRF.
- `commerce/domain/Fulfillment.kt` separa pasos de shipment mediante objetos;
  pickup no transita por `SHIPPED`.
- `checkout_snapshot.delivery` conserva modo, costo, destino, instrucciones,
  plazo y versión; el mapper distingue known, legacy missing e invalid.
- `DeliveryPolicyTest`, `DeliveryMigrationTest`, `FulfillmentPolicyTest`,
  `FulfillmentUseCaseTest`, `CommerceHttpIntegrationTest` y
  `frontend/e2e-real/commerce-fulfillment.spec.ts` son la evidencia focal.
- `sdd/features/20261114-checkout-delivery-decision/` acredita PR #272 y sus
  Verify de PR/post-merge; no acredita carrier.

### Storefront

- `CartController` exige CUSTOMER para read/write/checkout y
  `JdbcCartService` usa identidad `customer-{id}`; no existe guest cookie cart.
- `CustomerCartAccess` es el tipo cerrado compartido por controles/vistas y los
  efectos de `CartStore`; `customer.guard.ts` conserva su responsabilidad de
  sesión/ruta y no se documenta como consumidor de ese tipo.
- `sdd/features/20261113-pdp-purchase-intent-continuity/` define intención local,
  TTL, relectura autoritativa y confirmación explícita.
- `checkout-result.component.ts` relee la orden por id; la vista usa
  `PaymentStatus`/`OrderStatus` cerrados y nunca interpreta el retorno como pago.
- `OfficialOrderApiAdapter` no configura back URLs; ese transporte permanece en
  el WIP Mercado Pago live.
- PR #282 head `067921e` pasó Verify `43812281889` con cinco jobs verdes y agrega
  matriz real de rutas, no funcionalidades de proveedor.

## Reglas de arquitectura

- ORDER, PAYMENT y SHIPMENT conservan ciclos y tipos cerrados independientes.
- `PREPARING` no se renombra ni se duplica como `READY_TO_SHIP` sin transición,
  compatibilidad, migración y pruebas aprobadas.
- Un retorno de navegador nunca acredita pago ni habilita fulfillment.
- La URL de retorno sólo identifica una orden accesible; backend relee autoridad.
- Estados externos o wires desconocidos se traducen una vez a `Unknown`.
- Agregar notificaciones crea objetos paso/evento con responsabilidad única:
  producir evento, persistir outbox, renderizar template y entregar/reintentar no
  pertenecen a una misma clase.

## Cortes posteriores permitidos

1. Resultado pendiente: botón explícito o polling acotado, con estado cerrado de
   refresh, cancelación al cambiar ruta y tests pending→approved/Unknown/error.
2. Editor visual de política local: reutiliza API/CAS existente, sin carrier.
3. Notificaciones logísticas: outbox durable/idempotente y proveedor local de
   prueba; SMTP live mantiene gate separado.
4. Carrier: continúa el discovery Correo Argentino; ningún adapter hasta cerrar
   decisiones y credenciales QA.
5. Retornos Mercado Pago: sólo dentro de MP-LIVE-05, con contrato oficial y
   webhook tardío; nunca parámetros inferidos.

## Verificación de este corte

- `git diff --check` y validación de referencias/rutas.
- Dos reviews GPT-6.1 Sol independientes sobre head exacto.
- CI alojado completo aunque el cambio sea documental.
- Tras merge de #282: rebase/retarget, CI y reviews nuevos; evidencia anterior no
  se reutiliza como si fuera del nuevo SHA/base.
