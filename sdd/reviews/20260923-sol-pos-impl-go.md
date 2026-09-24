VERDICT: CONDITIONAL_GO

# Sol gate — fail-closed POS implementation

**Fecha:** 2026-09-23  
**Baseline:** `master` @ `e73bf4c` (PR #18 merged)  
**Alcance:** implementación in-repo, inactiva y verificable con doubles; no prueba ni integración live.

## Decisión

La aprobación documental r3 ya cerró el contrato, pero no era por sí misma autorización de implementación. Este archivo es el gate separado requerido y concede un `CONDITIONAL_GO` únicamente para `TASK-PIC-001`, `TASK-PIC-002`, `TASK-PIC-003`, `TASK-PIC-004`, `TASK-PIC-005`, `TASK-PIC-006`, `TASK-PIC-007`, `TASK-PIC-008` y `TASK-PIC-009`.

El propósito acotado es construir ahora el lado StoreCore del contrato con pruebas locales, dejando las pruebas live y el companion real para un gate posterior. No se autoriza `TASK-PIC-010`: `BLACKSTORE_INTEGRATION.future_optional` debe permanecer `true`.

## Condiciones obligatorias

- `BLACKSTORE_INTEGRATION` nace y permanece `DISABLED`, `future_optional=true`; ninguna migración, fixture, bootstrap, test o configuración puede activarlo, pausarlo, promoverlo ni volverlo obligatorio.
- Toda ruta HTTP y todo efecto asociado debe fallar cerrado mientras la capability esté `DISABLED`; no se permite bypass por perfil, entorno, test fixture desplegable, header ni configuración genérica.
- Se permiten los DDL/Flyway V4/V5 estrictamente definidos por `TASK-PIC-001/002`, los ports/DTOs/endpoints/workers/adapters internos de `TASK-PIC-003..009`, y sus pruebas locales/Testcontainers, sólo dentro del contrato aprobado.
- Las dependencias externas deben usar doubles/fakes locales. No se conecta StoreCore a una instancia BlackStore, no se consume un servicio POS real y no se accede a otra base de datos.
- `TASK-PIC-009` sólo puede probarse con outbox/adapters dobles: con la capability deshabilitada no puede encolar ni enviar una actualización ML causada por POS.
- Las credenciales se limitan al modelo y a referencias opacas ficticias de test. No se incorporan tokens, bearer reales, claves, certificados, DSN, secretos ni valores reutilizables.
- No se inventa autenticación o firma HMAC para BlackStore, Mercado Pago o fiscal. La integridad interna del cursor no puede convertirse en protocolo de autenticación inter-repo ni justificar una firma vendor no documentada.
- Las pruebas deben cubrir, como mínimo, capability deshabilitada, ausencia de side effects, idempotencia/concurrencia, expiry versus commit, tombstones/410, reconcile read-only, permisos, redacción, no acceso cross-database y OpenAPI.
- `EffectivePrice*.kt` permanece untracked, sin integrar y sin borrar hasta instrucción expresa del dueño.
- El estado del WIP puede reflejar este gate condicionado, pero no puede archivarse ni declararse live/production-ready. Antes de merge aplican las revisiones técnicas y el doble Grok exigidos por el repositorio.

## Efectos expresamente prohibidos

- `TASK-PIC-010`, V6 o cualquier cambio de `future_optional=true` a `false`.
- Activar `BLACKSTORE_INTEGRATION`, crear una vía de activación automática o usar una capability distinta para eludir el estado `DISABLED`.
- Conectar o modificar BlackStore, ejecutar pruebas live/end-to-end contra él, aceptar tráfico POS real o usar credenciales reales.
- Acceso cross-database/JDBC, `store_id`, shared runtime, `channel=POS`, `SALE`, ISSUE/REVERSAL, oversell o resucitar WIP superseded.
- Efectos externos reales hacia Mercado Libre u otro proveedor; despliegue, tag, release, publish o cambios de secretos/CI.
- Hardcodear cliente, dominio, credencial, SKU, precio o comportamiento de Universal Tools.
- Mezclar identidades/rutas USER y CUSTOMER.
- Interpretar este gate como autorización fiscal, de pago live, del companion BlackStore o de `/sdd.finish`.

## Fiscal

**NO.** Código, DDL, capability, inbox/outbox, worker y adapter fiscal continúan prohibidos. Requieren fuentes oficiales fechadas, D-01..D-07 y SC-01..SC-07 cerrados, matriz auténtica aprobada por dueño/contador y un `GO` Sol separado. “Desarrollar primero” no sustituye esas dependencias ni autoriza inferir decisiones regulatorias.

## MP-LIVE-05

**Sigue bloqueado y para más adelante.** Requiere cuenta, credenciales y evidencia real gestionadas fuera del repositorio y de CI, además de un gate Sol nuevo. MP-LIVE-01–04 permanecen cerrados fail-closed y no se reabren.

## Respuestas explícitas

1. **POS:** sí, `CONDITIONAL_GO` sólo para `TASK-PIC-001..009`, bajo los límites anteriores; no para `TASK-PIC-010`.
2. **Fiscal:** sí, sigue `NO` hasta evidencia oficial fechada, matriz dueño/contador y `GO` separado.
3. **MP-LIVE-05:** sí, sigue para después y fuera de repo/CI.
