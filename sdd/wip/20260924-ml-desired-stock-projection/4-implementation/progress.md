# Implementación — proyección de stock deseado ML

## Estado

`in_progress`. Astra emitió GO documental en TASK-DSP-R00 para comenzar TASK-DSP-000A y 000B. TASK-DSP-000A está implementada y aprobada localmente por dos revisores Astra sobre su diff aislado; tests PG16 enfocados pasaron. Evidencia: `sdd/reviews/20260927-astra-ml-desired-stock-r00-go.md` y `sdd/reviews/20260927-ml-dsp-000a-local-dual-code-go.md`. No hay commit/PR/merge ni aprobación del resto del DAG, activación o release.

## Secuencia segura prevista

1. TASK-DSP-000 registra integración `ab817891abb6c7b710bca809804d924401ed74f0`, ancestro PIC-009 `69f209b`, V1–V7 y V8 libre en esa base al 2026-09-27. Se revalida si cambia el HEAD antes de código. Astra reevalúa el WIP corregido en TASK-DSP-R00 y emite GO/NO-GO documental antes de código.
2. TASK-DSP-000A sella el writer PIC-009 con bridge fail-closed y prueba fixture ACTIVE; TASK-DSP-000B agrega migración V8+ de rutinas de lock/admin ML y refactoriza `JdbcCapabilityService.decide`. Ambas preceden el ownership canónico.
3. Resolver el selector tipado de cuenta externa sin depender de literales históricos; añadir snapshot/versión y la intención outbox versionada con Flyway compatible.
4. Integrar carrito/checkout reserve, MP consume, `releaseSaga` WEB interno idempotente al terminal MP verificado no pagado, expiry y ajuste dentro de transacciones multi-SKU ordenadas; nunca como callback post-commit.
5. Endurecer lifecycle/remapeo y demostrar con PG16 concurrencia, rollback de todas las líneas, grants positivos/negativos y replays.
6. Pasar dos reviews independientes de código/SDD y validación local; PR sólo a integración. El paso a master requiere CI remoto verde y gate separado.

## Gates no negociables

- `available_quantity` es neto de reservas; no restar `reserved_quantity` una segunda vez.
- `SALE_APPLIED` y `STOCK_DESIRED_CHANGED` siguen siendo eventos distintos.
- Cada nueva proyección emitida crea exactamente una delivery durable `PENDING`; no hay dispatcher en esta feature.
- La versión actual invalida lógicamente mensajes antiguos; no se muta ni borra el outbox inmutable para “coalescer”.
- No existen red ML, OAuth, secretos, conector BlackStore, fiscal ni flags genéricos. El sellado del writer PIC-009 no habilita su capability ni crea tráfico.
- CI sin runner verde no se interpreta como aprobación.
- `TASK-DSP-000` es control documental de admisión y `TASK-DSP-R00` review Astra previa a código/Flyway. La base efectiva de implementación es integración `ab817891` con PIC-009 ancestro y V8 libre al 2026-09-27; el checkout WIP `a886f48` es sólo origen de redacción. Revalidar HEAD y V8 antes de migrar. No se declara coexistencia segura ni se activa BlackStore.
- El protocolo único descubre candidatos sin lock y obtiene snapshot action/config/kill mediante función estrecha `SECURITY DEFINER` con `FOR SHARE` en PG16; sigue cuentas, productos, variants, orders, MP attempts, reservations, balances y listings ASC antes de escribir. Runtime NOLOGIN no recibe UPDATE directo sobre action/config/switch. V8+ revoca EXECUTE V3 de PUBLIC, cierra caminos genéricos ML y refactoriza `JdbcCapabilityService.decide` y administración ML. Carreras create/replace/remove/state/config contra emisión y consume/release/expiry contra reserva multi-SKU prueban ausencia de deadlock y fail-closed. Grants se prueban positivos y negativos con login de prueba runtime.
- La CHECK del outbox exige `projection_version IS NOT NULL` para `STOCK_DESIRED_CHANGED`; NULL histórico sigue permitido para otros kinds. Cualquier fallo de delivery revierte todas las líneas de un comando WEB/MP multi-SKU.
- El release WEB explícito se implementa en TASK-DSP-004 como `releaseSaga` interno para terminación MP verificada no pagada; nunca se libera por pago pendiente/ambiguo/acreditado. Replay y carrera con consume/expiry conservan una sola transición y una sola restitución de saldo.
- Upgrade crea WITHHELD versionado y sin outbox para accounts/listings históricos desconocidos; sólo una clasificación y reactivación auditadas generan el baseline PENDING.
- La proyección local no recibe caller ML ni trata inbox durable como binding/identidad probados. No modifica `notify`, no activa webhook ni inventa su contrato de firma; `ml-inbox-to-projection` queda bloqueado hasta binding oficial y refetch.

## Compatibilidad diferida

PIC-009 local (`69f209b`) contiene `LISTING_STOCK` sin versionado/delivery. Se preserva como histórico; su writer directo se sella antes de que el proyector sea owner. El bridge sigue deshabilitado y sólo una delegación posterior, con PIC-005 GO separado, podrá invocar el proyector canónico.
