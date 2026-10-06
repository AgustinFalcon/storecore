# Plan incremental con gates

GO documental registrado en `sdd/reviews/20261006-commerce-fulfillment-plan-sol.md`.
Implementación incremental local en progreso; ninguna tarea cerrada todavía.
GO documental no es review de implementación ni aprobación de publicación.
El estado actual y los bloqueos de ejecución están en tasks.json/progress.md.

1. CFE-T01 — Inventariar todos los consumidores de los cuatro estados (checkout,
   customer/admin orders, mappers, fixtures y worker) y fijar contratos cerrados
   y snapshot de elegibilidad. Corregir tests falsos primero como regresiones
   rojas; separar el test de promo del de fulfillment. Depende del GO.
2. CFE-T02 — Tipos/políticas/puertos Kotlin y traductores JDBC/HTTP; paso por
   Commerce.kt/CheckoutReceipt/OrderView y productores necesarios para compilar.
   Unit tests de cada caso conocido, Unknown, None/NotCreated y política cruzada.
   Depende T01. Gate: dominio sin framework y wires válidos compatibles.
3. CFE-T03 — Adapter de evidencia y comandos transaccionales, protocolo de lock
   con writers de pago, recepción única y eliminación de restock implícito.
   Depende T02. Gate: PostgreSQL real, acreditación + consumo exacto + casos
   negativos, concurrencia, rollback y retries; no sólo mocks JDBC.
4. CFE-T04 — Tipos TS, mapper único, repository/use cases, todos los consumidores
   del inventario T01 y controles de fulfillment; retirar defaults permisivos.
   Depende T02/T03. Gate: unit boundary/domain, store y build/architecture/lint;
   ningún template o test de dominio compara literals de estado.
5. CFE-T05 — E2E real local/CI y clean/upgrade, integrar corrección de los tests
   falsos. Depende T03/T04. Gate: todos los escenarios obligatorios abajo PASS.
6. CFE-T06 — Dos reviews independientes GPT-6.1 Sol medium en paralelo del diff
   final, base/head exactos, arquitectura y seguridad, después de leer motivo,
   descripción y diff completo. Corregir y repetir ambos si piden cambios.
   Depende T05. Ambos APPROVED más CI del head exacto; luego close-out honesto
   SDD. Publicación/merge no autorizado por esta especificación.

## Trazabilidad requisito → tarea → target → evidencia

Prefijos: BE=`backend/src/main/kotlin/com/storecore/commerce/`,
BT=`backend/src/test/kotlin/com/storecore/commerce/`,
FE=`frontend/src/app/`. Targets nuevos son propuestos, no archivos implementados.

- R01 → T01/T02/T04 → BE domain/Commerce.kt + nuevos CommerceStates y adapters;
  FE domain/order/order.entity.ts, fulfillment-transition.ts y data/mappers/http-mappers.ts
  → nuevos CommerceStatesTest y order-state/mapper specs: todos los casos,
  unknown/null/malformado y compatibilidad; FixtureOnly, NOT_RUN.
- R02 → T02/T03 → nueva FulfillmentEligibility y adapter/port de evidencia,
  BE infrastructure/JdbcOrderService.kt y mporders/MpOrderApplicationWorker.kt
  → nuevo FulfillmentEligibilityTest + BT CommerceHttpIntegrationTest y
  MpOrdersCheckoutIntegrationTest: E01–E04/E08; RealLocal pendiente, NOT_RUN.
- R03/R06 → T03 → pasos de shipment y coordinator/JdbcOrderService
  → integración PostgreSQL E03/E05/E06: secuencia, doble actor, rollback;
  RealLocal pendiente, NOT_RUN.
- R04/R05 → T03/T04 → paso ReceiveReturn, RMA mapper/domain y
  FE features/admin/fulfillment.view.*, fulfillment.store.ts
  → E04/E05/E07 y unit UI: recepción completa, histórico bloqueado,
  INSPECTED/ADJUSTED sin efectos; RealLocal pendiente, NOT_RUN.
- R07 → T04/T05 → FE data/repositories de order, domain/order/use-cases,
  customer order/checkout views y admin fulfillment; OrderController
  → E01/E02/E07/E08, HTTP destination + readback tras reload; RealLocal
  pendiente, NOT_RUN. MockHttp sólo valida representación Unknown.
- R08 → T01/T05 → BT CommerceHttpIntegrationTest,
  MpOrdersCheckoutIntegrationTest, FE fulfillment-transition.spec.ts y suite
  Playwright existente extendida → E01–E09 y artifacts de run exacto;
  RealLocal/CI pendiente, NOT_RUN. Nunca reemplazar aceptación por skip.
- R01–R08 → T06 → sdd/reviews + este WIP → dual review base/head + CI exacto;
  Review NOT_RUN, Publication BLOCKED. Toda fila necesita revision/file real,
  test/run, clasificación y disposición antes de cierre.

## Escenarios obligatorios

- E01: checkout real HTTP mantiene PENDING_PAYMENT/PENDING; todos los comandos
  ship/RMA rechazan, sin shipment/return/event/ajuste. CUSTOMER no puede ejecutar.
- E02: matriz de cada estado bloqueado de order/payment, Unknown (borde unit y
  HTTP mock donde constraints DB impiden insertarlo), pago faltante/múltiple,
  importe/moneda/evidencia ausente y ledger de otro pedido. Cero efectos.
- E03: flujo oficial fake sólo en puerto externo → worker real → DB acredita y
  consume → PACKED/SHIPPED/DELIVERED HTTP → reload. Assert respuesta **y**
  persistencia, evento único, fechas y balances/reservas/SALE exactos.
- E04: mismo flujo con reserva vencida y re-reserve; probar coincidencia de
  variante/cantidad, consumo incompleto/excedido y PAID_STOCK_REVIEW rechazado.
  No aprobar por count ni por original saga sola.
- E05: dos sesiones USER sobre primer shipment y primer RMA, replay por sesión
  válida y comando fuera de orden. Un único efecto, rechazo determinista del
  segundo y sin efecto de stock. RMA antes de DELIVERED bloqueado.
- E06: carrera con acreditación/reversión/terminación y fallo inyectado después
  del primer write: no estado/evento parcial ni deadlock persistente; lock order
  y CSRF se verifican. Timeout + GET + retry no duplica nada.
- E07: pedido entregado elegible recibe RMA una vez; cantidades originales
  exactas; INSPECTED/ADJUSTED siempre rechazados incluso sobre histórico
  INSPECTED RESTOCK. Balances/ledger sin cambios; frontend no ofrece acciones
  diferidas y Unknown no se imprime raw ni habilita controles.
- E08: sin sesión, CUSTOMER, rol sin permiso, capability disabled/read-only,
  CSRF ausente/stale, origen inválido y ownership ajeno mantienen contrato.
- E09: Flyway clean y upgrade baseline sin editar checksums, lectura de históricos
  y UI real Angular HTTPS → Spring → PostgreSQL. Navegación/reload conserva
  estado autoritativo. Sin browser intercept para la aceptación de wiring.

## Contrato de evidencia y cierre

Registrar por escenario actor fixture, estado inicial, frontend build/origin,
backend build/destino, DB/schema aislado, request/response, readback, resultado,
base/head exactos, command/run CI y artifacts redactados. Origin/destino reales
se documentan sólo en evidencia segura, sin secretos. La simulación de MP queda
declarada: prueba wiring local, no homologación de proveedor. Inventariar recursos
propios antes de crear; teardown sólo de sus IDs y rutas verificadas. No matar
por nombre/puerto. Tests bloqueados/flaky/skipped no pasan gates. Hosted CI
que no arrancó no es verde. No iniciar recursos para este plan documental.

Gates iniciales: Implementation NOT_RUN; Integration NOT_RUN; Review NOT_RUN;
Homologation BLOCKED externa; Publication BLOCKED. Archive sólo tras todas las
tareas/verificaciones y autorización Sol; el residual de disposición se registra
como slice separado, nunca como restock implementado.
