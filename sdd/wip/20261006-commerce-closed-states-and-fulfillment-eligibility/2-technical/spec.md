# Diseño técnico y decisiones

## Evidencia estática del problema

En el baseline de meta.md, `commerce/domain/Commerce.kt` expone estados String.
`commerce/infrastructure/JdbcOrderService.kt` sólo excluye PAID_STOCK_REVIEW en
ship/rma, crea shipment antes de validar transición, marca inspección RESTOCK y
repone todos los ítems al cerrar. Estos paths son relativos a
`backend/src/main/kotlin/com/storecore/`.

`frontend/src/app/domain/order/order.entity.ts` usa strings/unions;
`fulfillment-transition.ts` ofrece PACKED/RECEIVED en el default desconocido.
`backend/src/test/kotlin/com/storecore/commerce/CommerceHttpIntegrationTest.kt`,
test `promo overlap conflicts and fulfillment rma stays ordered`, hace checkout
y despacha sin acreditar, luego acepta CLOSED en response **o** DB. El test
`frontend/src/app/domain/order/fulfillment-transition.spec.ts` sólo prueba textos
conocidos y denomina a una transición prueba de restock, sin observar inventario.
Son hallazgos estáticos, no resultados ejecutados en este corte.

`OrderController` usa `IdentityMutationCoordinator.execute`, que ya envuelve
CSRF y efecto en TransactionTemplate: no afirmar que hoy carece de transacción.
El defecto concurrente es falta de lock de agregado orders antes de evaluar y
crear hijos, especialmente con dos sesiones distintas. `MpOrderApplicationWorker`
accredit bloquea orders, acredita pago y consume stock; re-reserve usa otra saga
que no sustituye reservationSagaKey original. No validar consumo sólo por esa
saga ni por cantidad de filas.

## Tipos y responsabilidades

Kotlin enum/sealed con Unknown, sin Spring/SQL/HTTP en domain/application.
OrderStatus: CREATED, PENDING_PAYMENT, PAID, PAID_STOCK_REVIEW, CANCELLED,
EXPIRED, REFUNDED, Unknown. PaymentStatus: PENDING, APPROVED, REJECTED,
CANCELLED, REFUNDED, CHARGED_BACK, Unknown. ShipmentStatus: NotCreated,
PENDING, PREPARING, SHIPPED, DELIVERED, CANCELLED, Unknown. RmaStatus: None,
REQUESTED, APPROVED, RETURN_RECEIVED, INSPECTED, REJECTED, CLOSED, Unknown.
Ausencia sólo proviene de LEFT JOIN sin fila; un status null en fila es Unknown.
InspectionOutcome histórico: NotRecorded, RESTOCK, DAMAGED, REJECTED, Unknown;
es lectura, no autorización de ajuste. Comandos ShipmentCommand y RmaCommand
incluyen los valores legacy y Unknown; reconocer INSPECTED/ADJUSTED no habilita
su ejecución. Razones de rechazo/elegibilidad también son tipos cerrados.

TypeScript implementa cada conjunto con constructor privado, instancias estáticas
y único fromWire. Kotlin ofrece traductor único por tipo reutilizado en JSON y
JDBC. Valores válidos serializan los wires existentes; Unknown usa sentinel
seguro, nunca raw input. Labels y reglas viven en tipos/políticas del dominio,
no en switch de templates, stores, tests o mappers duplicados. Tests de dominio
consumen instancias; sólo tests de borde manipulan wires inválidos.

FulfillmentEligibility consume snapshot tipado de evidencia, no JdbcTemplate.
Pasos PackShipment, ShipShipment, DeliverShipment y ReceiveReturn son objetos
con responsabilidad única y el recorrido los ordena. El use case usa puertos de
carga/guardado y el adapter coordina locks/transacción. Se extrae únicamente el
flujo tocado de JdbcOrderService; no se reorganiza todo commerce. Angular conserva
container → view → ComponentStore → use case → HTTP repository.

## Evidencia autoritativa de venta y lectura

El adapter carga el pedido y la acreditación única
`mp_order_commercial_applications` PAYMENT_ACCREDITED, enlazando attempt/payment
al mismo order, importe total y moneda, attempt ACCREDITED y pago APPROVED.
Bloquea cualquier `mp_order_reversal_cases` del pedido (vía attempt), incluso
si dice RESOLVED: este corte no define una resolución que restituya elegibilidad.
Bloquea además incidentes de duplicate-credit/paid-without-stock no resueltos;
review_status desconocido falla cerrado. `reverse` actualmente registra el caso
sin cambiar PAID/APPROVED: leer sólo esos estados daría un falso elegible. No
deducir aprobación por último pago ni por `firstOrNull` de joins multiplicados.
Ausencia o ambigüedad da inelegible. Esta fuente es el flujo oficial persistido,
no un nuevo flag supplied por cliente.

Para cada variant/cantidad de order_items debe existir consumo WEB SALE con
reserva CONSUMED, variante y delta exactos, atribuido por el adapter al pedido
mediante el actor canónico `MP_ORDERS:<orderId>` del writer actual. Validar
correspondencia completa: sin faltantes, extras ni doble consumo; reservas y
ledger deben concordar. Actor es representación de persistencia interna, no
prueba HTTP ni regla de UI. Incluir saga original y re-reserve acreditada; un
ledger de otro pedido, mera RESERVATION, suma parcial o número de filas igual
no basta. Si la procedencia no puede demostrarse, bloquear sin backfill.

Lectura de orders evita el join ambiguo de payments: resolver pago del attempt
acreditado, y para no acreditados una representación no elegible determinista;
datos múltiples incompatibles resultan Unknown. DTO puede añadir elegibilidad
cerrada y acciones permitidas para que frontend no reconstruya pruebas de pago.
Una respuesta legacy sin evidencia/acciones bloquea controles. Revalidar siempre
servidor al escribir aunque el DTO anterior indicase elegible.

## Transacción, concurrencia y repetición

Preservar coordinación CSRF existente. Todo entrypoint de escritura del nuevo
use case exige transacción exterior; no depender de autocommit cuando se llama
directamente en test/worker. Lock orders FOR UPDATE antes de leer elegibilidad,
shipment o return; luego pago/attempt/evidencia y filas hijas en orden estable.
Auditar accredit, terminateUnpaid y reverse del worker, y bind/recovery de attempts: todos los writers que
cambian elegibilidad deben serializarse sobre el mismo order antes del cambio.
Si el orden actual de locks contradice ese protocolo, alinear los writers tocados
en CFE-T03 y probar deadlock/retry; no aceptar TOCTOU como residual.

Evaluar antes de INSERT. Shipment y evento se escriben atómicamente; RMA e ítems
también. Error de persistencia revierte todo, incluida rotación CSRF. Dos sesiones
concurren para evitar que el lock de sesión o token enmascare el race. Repetición
de una transición anterior: rechazo 400/FULFILLMENT_TRANSITION_REJECTED conforme contrato
actual, cero nuevos efectos; auth y CSRF conservan sus códigos. Timeout ambiguo
se resuelve mediante GET y estado tipado. No nueva tabla de idempotencia en este
corte; no prometer retry con éxito idéntico ni exactly-once de transporte.

## Migración y compatibilidad

Decisión: sin DDL ni reescritura de migraciones publicadas. Los valores válidos
ya existen en V1 y PAID_STOCK_REVIEW en V4. NotCreated/None/Unknown son estados de
lectura, no nuevos valores a persistir. RMA recibido reutiliza esquema actual,
una recepción por pedido serializada por lock y presencia de cualquier return;
no añade multiplicidad/parcialidad. INSPECTED/ADJUSTED conservan wire reconocido
pero quedan rechazados explícitamente: cambio de seguridad intencional.

No reconstruir historial RESTOCK ni compensar ledger automáticamente. Inventariar
datos inconsistentes en entorno aislado y documentar bloqueo; reparación futura
necesita plan propio. Si la implementación demuestra necesaria una restricción
o vínculo durable adicional, detener ese task y volver a Sol con delta forward
Flyway y pruebas clean/upgrade; no modificar V1/V4 ni relajar elegibilidad.
Validar instalación limpia y upgrade desde baseline aunque no haya DDL nuevo.
Rollback de binario que reabre despacho sin pago no es rollback aceptable:
ante fallo, detener escrituras de fulfillment con capability existente y conservar
datos; una eventual operación productiva necesita autorización separada.

## Seguridad y seguimiento

Preservar auth USER operator/admin, CUSTOMER ownership, same-origin, CSRF y
capability. Logs sólo IDs internos y razones cerradas, sin payloads oficiales,
tracking/PII ni secretos. External gates MP-LIVE-05, fiscal, Correo y BlackStore
siguen NO-GO; mocks del puerto oficial no homologan proveedor.

Follow-up `commerce-rma-item-disposition-and-restock`: exige outcomes explícitos
por ítem, cantidad recibida/inspeccionada/dispuesta acotada a consumo y devoluciones
previas, inspección auditada, separación dañado/rechazado, idempotencia ledger y
reversión/concurrencia. No existe tarea ejecutable de ese follow-up aquí.
