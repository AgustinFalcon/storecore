# Especificación técnica — contrato fiscal StoreCore

**Estado:** `documented_deferred` · **Fecha:** 2026-09-21

## Arquitectura de borde

```text
Pago/proveedor oficial → inbox durable/validador → aplicación StoreCore
                                                  └→ intención + outbox (misma transacción)
                                                        → worker aislado
                                                          → adapter arca-facturacion
                                                            → servicio ARCA seleccionado por D-04
```

La biblioteca externa mantiene protocolos ARCA, QR y clasificación fiscal. StoreCore mantiene política de elegibilidad, estado durable, outbox, ejecución, locks, auditoría y la correlación con su dominio comercial. Este diseño no añade una dependencia fiscal al módulo core hasta que las decisiones y tareas sean aprobadas.

## Puertos futuros

```kotlin
interface FiscalEligibilityPolicy {
    fun evaluate(input: VerifiedBusinessEvent): EligibilityDecision
}

interface FiscalIntentRepository {
    fun createWithOutbox(command: CreateFiscalIntent): FiscalIntentId
}

interface FiscalDispatchWorker {
    fun dispatch(outboxMessage: FiscalDispatchRequested)
}
```

Las interfaces son ilustrativas del límite, no una autorización para crearlas todavía. `VerifiedBusinessEvent` debe portar referencias estables y no secretos; la verificación de Mercado Pago u otro proveedor ocurre antes de `FiscalEligibilityPolicy`.

## Persistencia futura: requisitos, no DDL

Se requerirán aggregates/registros separados para el perfil emisor que resulte de D-02, referencia opaca a secreto, política fiscal versionada, intención fiscal, intento, documento autorizado, outbox e inbox/registro de notificación de pagos. Deben relacionarse con la única instalación actual mediante FKs y constraints normales de StoreCore, **sin** agregar `store_id` ni relaciones cross-client.

Restricciones lógicas mínimas:

- una notificación de proveedor ya procesada no vuelve a aplicar efectos;
- una `fiscalEligibilityKey` no origina más de una intención vigente;
- un `workerOperationKey` no ejecuta dos despachos equivalentes;
- un documento autorizado se asocia a una sola intención y no es actualizable;
- rectificativos se vinculan al documento original y sólo existen si la política los habilita.

La forma física, nombres de tablas, índices, estrategia de lock y migraciones Flyway quedan bloqueados por SC-02 a SC-04 y requieren un WIP implementable aprobado.

## Serialización y conciliación

Antes de solicitar autorización, el worker debe serializar la emisión por `(emisor, punto de venta, tipo de comprobante)` usando un mecanismo duradero elegido en SC-03. Consultar el último comprobante es una verificación ARCA, no un lock distribuido suficiente.

SC-03 exige exclusión interproceso durable con fencing/versionado, propiedad verificable antes de llamar, recuperación tras crash y ninguna liberación/reasignación ante incertidumbre. Las pruebas cubren dos workers, caída con lock y timeout posterior al envío.

Tras un resultado ambiguo, el worker persiste `UNKNOWN_RECONCILIATION`, consulta/contrasta el comprobante específico y consolida sólo una de estas salidas: autorizado hallado, ausencia demostrada que permite nuevo intento según política, o revisión manual. Los rechazos fiscales son terminales para el mismo snapshot; reintentos automáticos quedan limitados a fallos técnicos clasificados como transitorios.

## Seguridad y observabilidad

- Perfil fiscal y certificados se resuelven desde referencias opacas de un secret store aprobado, con ACL por emisor, rotación/revocación y acceso mínimo.
- Auditoría conserva hashes/correlaciones, códigos remotos, timestamps y versiones de política/manual; payloads se redaccionan/minimizan.
- Logs y métricas excluyen certificados, claves privadas, tickets WSAA, tokens de pago, documentos completos y PII innecesaria.
- La configuración usa capability tipada y kill switch acotado conforme `sdd/PATTERNS.md`; no crea feature flags genéricos ni habilita escritura al estar pausada.

Se separan snapshot/documento fiscal autoritativo protegido, proyección de auditoría/log redaccionada y política de retención/acceso/exportación/borrado bloqueado por obligación legal. La capability fiscal requiere agregarse explícitamente a la allowlist del baseline mediante WIP aprobado; `PAUSED` detiene nuevos despachos, pero no abandona conciliaciones `UNKNOWN`.

SC-07 decide si el fiscal usa outbox propio o una extensión formal de `integration_outbox`, qué fuente elegible admite y cómo conserva atomicidad con `payment_event_applications`; queda prohibido reutilizar el outbox actual por inferencia.

## Pruebas obligatorias antes de activar

1. Inbox/notificación repetida, pago repetido y worker duplicado.
2. Elegibilidad no activada por redirect o webhook no verificado.
3. Transacción intención+outbox atómica y recuperación tras caída.
4. Lock concurrente por emisor/PV/tipo.
5. Rechazo ARCA, timeout antes del envío, timeout después del envío y conciliación.
6. Snapshot inmutable, QR determinista y rectificativo sólo si la política lo permite.
7. Homologación con credencial/certificado de prueba autorizado para el entorno aplicable, sin incorporarlo al repositorio; WSDL/manual/catálogos fechados y evidencia saneada.

## Gate de implementación

Ninguna clase, migración, endpoint, job ni secreto se agrega en StoreCore con este SDD. Para abrir un WIP implementable se exige el cierre documentado de D-01..D-07 y SC-01..SC-07, compatibilidad versionada con `arca-facturacion` (API, errores/estados, idempotencia y cambio de manual), evidencia de matriz fiscal/servicio, plan de homologación y GO de Sol.
