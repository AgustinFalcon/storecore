VERDICT: CONDITIONAL_GO

# Sol gate — siguiente tramo POS verificable

**Fecha:** 2026-09-23  
**Base:** `20260923-sol-pos-impl-go.md`, ADR-008, estado y plan POS vigentes  
**Alcance:** promoción documental acotada y prueba local con Testcontainers; ninguna activación real.

## Decisión

### TASK-PIC-010 — CONDITIONAL_GO

Se autoriza implementar únicamente la promoción documental
`BLACKSTORE_INTEGRATION.future_optional=true → false`. La fila de
`module_configurations` debe permanecer `DISABLED`; no se autoriza activar,
pausar ni configurar el módulo como operativo.

La migración debe respetar ADR-008: lock y asserts fail-closed sobre la única
fila, estado `DISABLED`, schema v2 y configuración esperada; deshabilitar sólo
el trigger de inmutabilidad estrictamente necesario; cambiar una sola columna
de un solo módulo; re-habilitar el trigger `ALWAYS` antes del commit. No puede
otorgar DDL/DML de registry al runtime ni tocar actions, companion, credentials
o cualquier otro módulo. Debe usar el siguiente número Flyway libre: el repo ya
ocupa V5 para registry y V6 para saga; no se autoriza reutilizar V6.

### ACTIVE temporal sólo en Testcontainers — CONDITIONAL_GO

Después de aplicar y validar TASK-PIC-010, se autoriza una transición temporal
`DISABLED → ACTIVE` exclusivamente dentro de tests Testcontainers efímeros para
probar las respuestas HTTP 200/409/410 y los AC de PIC-003..009/L3 que hoy
quedan tapados por el 403 fail-closed.

La transición debe recorrer el flujo público CAS/audit de
`CapabilityAdministrationPort`, con usuario ADMIN, razón y correlación de test,
reenviando config/schema v2. Quedan prohibidos SQL directo, trigger bypass,
session flags, perfiles de aplicación, headers, fixtures desplegables o un
segundo camino de activación. El contenedor no puede conectarse a BlackStore,
otra base, Mercado Libre, Mercado Pago ni servicios fiscales; usa sólo
doubles/fakes locales, referencias opacas ficticias y se destruye al terminar.
La configuración normal y toda ejecución fuera de ese test siguen `DISABLED`.

Este permiso es de verificación, no evidencia live ni autorización operativa.
Los tests deben demostrar además que el baseline fuera del caso aislado
continúa devolviendo 403 sin side effects y que 409/410 respetan la matriz,
idempotencia, tombstone y `retryable` aprobados. PIC-003..009 y L3 sólo pueden
marcarse done con evidencia verde completa; un test temporal ACTIVE no prueba
identidad, red, credenciales ni compatibilidad de un companion real.

### Companion live, fiscal y MP-LIVE-05 — NO-GO

No se autoriza implementar, conectar ni probar un companion BlackStore real;
usar endpoints, base, tokens, certificados o secretos reales; aceptar tráfico
POS real; ni declarar compatibilidad cross-repo/live.

Fiscal continúa `NO-GO`: sin código, DDL, capability, inbox/outbox, worker,
adapter, emisión o inferencias regulatorias. MP-LIVE-05 continúa `NO-GO` y
fuera de repo/CI hasta evidencia real y un gate Sol separado.

## Límites

- No inventar HMAC, firma o autenticación vendor.
- No secretos, deploy, tag, release, publish ni cambios de CI para credenciales.
- No `/sdd.finish`, archive ni declaración production-ready/live.
- No acceso cross-database, `store_id`, shared runtime ni `channel=POS`.
- Este gate amplía sólo PIC-010 y la prueba Testcontainers descrita; conserva
  todas las demás condiciones de `20260923-sol-pos-impl-go.md`.
