# ADR-008 — Compatibilidad V3 y promoción acotada de capability

**Status:** proposed for Sol · **Fecha:** 2026-09-22

## Contexto

El baseline V3 hace `capability_actions.action_kind` obligatorio y lo valida semánticamente. También mantiene `module_configurations` schema v1 exactamente `{}`, protege registry/actions contra UPDATE/DELETE con triggers y exige que un `future_optional` permanezca `DISABLED`. Un delta que insertara sólo `(module_code, action_code, allows_write)`, o que `changeState` pasara `{}`, falla o destruye configuración tipada.

## Decision

V4/PIC-001, posterior a V3, es el único dueño de registry/config/companion/credentials de BlackStore. Inserta cada acción con `action_kind` y `allowed_when_paused` explícitos y crea `BLACKSTORE_INTEGRATION` como `future_optional=true`, `DISABLED`, schema v2. Schema v2 acepta exactamente trece números contractuales; sólo `reservation_ttl_seconds` puede cambiar dentro de `[60,3600]`. Tokens, referencias de secretos y claves no declaradas son inválidos. El dispatch SQL/Kotlin conserva schema v1 `{}` para todo módulo restante.

Los cambios de estado reenvían la config/schema actuales mediante el `CapabilityAdministrationPort`: mantienen CAS, razón, correlación y audit before/after; nunca reemplazan la configuración por `{}`. Las actualizaciones v2 usan el mismo camino y CAS.

V5/PIC-002 es dueño exclusivo de saga, tombstone, líneas, cursor y delta ledger; no duplica registry, companion, credentials ni seed de V4.

Numeración Flyway canónica: V4 = Mercado Pago Orders; V5/`TASK-PIC-001` = registry BlackStore; V6/`TASK-PIC-002` = saga/tombstone; V7/`TASK-PIC-010` = flip documental `future_optional`. No reutilizar `TASK-PIC-007` (envelope de error/rate-limit) ni editar V6.

La única excepción migratoria a la inmutabilidad es V7/`TASK-PIC-010` bajo `20260923-sol-pos-next-go.md`. `storecore_migrator` con lock de tabla y asserts de fila/config DISABLED v2 deshabilita temporalmente sólo el trigger de `capability_modules`, cambia exactamente `BLACKSTORE_INTEGRATION.future_optional` de true a false, lo re-habilita `ALWAYS` y hace commit. No activa el módulo ni toca config, actions u otro registry. El runtime carece de privilegio DML/DDL; un ADMIN posterior usa el flujo CAS/audit de `CapabilityAdministrationPort` que reenvía la config/schema v2 actuales (nunca `{}`). Fuera del next-go, este ADR no autoriza ejecutar V5/V6/V7.

## Rejected

Confiar en defaults V1 para `action_kind`; reutilizar schema v1 `{}` para BlackStore; permitir claves genéricas o secretos en config; hacer `changeState` con `{}`; duplicar seeds en V5; deshabilitar triggers permanentemente; usar un session flag/bypass runtime; o promover todos los future-optional juntos.
