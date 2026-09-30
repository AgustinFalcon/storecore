# POSC-002G — rollout y transferencia (una VM, un comercio)

**Estado:** runbook documental. No es control plane, no autoriza activar `BLACKSTORE_INTEGRATION`, no cierra TASK-POSC-002 ni desbloquea POSC-003.

Una instalación es un comercio, una PostgreSQL 16, un dominio y una VM. Este texto describe el delta POSC-002 ya integrado (`V8`–`V10` + bearer HTTP + guards + matriz 002F) y lo que sigue abierto. Backup/restore genéricos viven en `sdd/features/20260921-single-tenant-installation-baseline/2-technical/fleet-operations.md`. No copiar secretos, tokens, connection strings ni payloads comerciales a este archivo.

## Registro de PRs y SHA

Head de integración al redactar: `origin/integration/storecore-int` = `bfdfb88` (merge POSC-002F, PR #70). Revalidar `git rev-parse origin/integration/storecore-int` antes de cualquier migrate.

| Corte | PR | Merge SHA | Flyway / código | Reviews Grok 4.7 |
|---|---|---|---|---|
| Shared ACL / Tx-C SQL | #66 | `20152b9` | `V8__posc002_shared_capability_cutover.sql` | `sdd/reviews/20260929-grok-prv8-sdd.md`, `sdd/reviews/20260929-grok-prv8-scope.md` |
| Companion schema / Tx-P SQL | #67 | `37b1621` | `V9__posc002c_companion_admin.sql` | `sdd/reviews/20260929-grok-prv9-sdd.md`, `sdd/reviews/20260929-grok-prv9-scope.md` |
| Bearer HTTP / principal | #68 | `d4a3a36` | filtro + verifier; sin YAML nuevo | `sdd/reviews/20260929-grok-prv10-sdd.md`, `sdd/reviews/20260929-grok-prv10-scope.md` |
| POS guards + engine | #69 | `7579d1d` | `V10__posc002e_companion_guards.sql` | `sdd/reviews/20260929-grok-prv11-sdd.md`, `sdd/reviews/20260929-grok-prv11-scope.md` |
| Matriz de aceptación | #70 | `bfdfb88` | tests only | `sdd/reviews/20260930-grok-prv12-sdd.md`, `sdd/reviews/20260930-grok-prv12-scope.md` |

POSC-000 `#59` (`6ebab95`), POSC-000A `#61` (`3df741c`), POSC-001 `#63` (`9ce355b`) son predecesores. Verify alojado no se interpreta como CI verde.

## Qué queda instalado tras Flyway V1–V10

- `BLACKSTORE_INTEGRATION` permanece `DISABLED` en migrate limpio y en upgrade con filas. Activación temporal sólo en tests; restaurar `DISABLED` antes de terminar.
- Roles NOLOGIN: `storecore_capability_admin_owner`, `storecore_capability_admin`, `storecore_companion_admin_owner`, `storecore_companion_admin`, `storecore_pos_guard_owner`.
- Tx-C SQL: `capability_tx_c_execute` / `status` / `abort`. EXECUTE sólo `storecore_capability_admin`. PUBLIC y `storecore_runtime` sin EXECUTE.
- Cuatro firmas V3 (`capability_admin_change_*` / kill) revocadas de PUBLIC y `storecore_runtime` en V8. Siguen existiendo; el adapter HTTP llama `capability_tx_c_execute` (PR #72, `8bc95cf`), no las firmas V3.
- Tx-P SQL: `companion_admin_prepare_command`, `attach_secret`, `command_status`, `abort_command`, `pair`, `rotate`, `activate`, `suspend`, `revoke`. EXECUTE sólo `storecore_companion_admin`. El adapter HTTP USER ADMIN+CSRF y el provider de instalación viven en el corte 002C (no en este runbook documental).
- Guards POS: `pos_companion_effect_guard` (VOLATILE, primera sentencia de Tx mutante READ COMMITTED) y `pos_companion_read_guard` (STABLE, primer SELECT RR). EXECUTE `storecore_runtime`. Owner `storecore_pos_guard_owner` NOLOGIN.
- Bearer opaco ≥256 bit; fingerprint selecciona; comparación constante autentica. `X-Client-Instance-Id` no crea identidad. `includeCost=true` → `COST_SCOPE_REQUIRED`.
- Índice 0..1 companion no-REVOKED: no hay dos `ACTIVE` simultáneos. GET/reconcile filtran `client_instance_id`.
- Residual de privilegio: runtime `INSERT(variant_id)` sobre `inventory_balances` es **false**. `lockBalance` lo necesita; no ampliar DML en este runbook.
- ML REPEATABLE READ admin-wins: NO-GO propio (`TASK-DSP-000B`). Este runbook no lo aprueba.

## Preflight (antes de migrate)

Completar en el catálogo de operador, nunca en el repo:

1. `GET /api/v1/health` → `{ status: "UP" }` y Actuator `/actuator/health`.
2. `installation_settings` tiene exactamente una fila `installation_id=1`.
3. `SELECT version, checksum, success FROM flyway_schema_history ORDER BY installed_rank` — anotar última versión exitosa (esperado ≤ V7 en instalaciones pre-002, V10 tras este delta).
4. Confirmar artifact id + Flyway como par. Writers pausados o snapshot consistente.
5. Dump cifrado fuera de la VM (`fleet-operations.md`). Registrar dump id, Flyway, artifact, UTC, operador.
6. No hay segundo proceso Maven/Flyway contra la misma base.
7. Roles app siguen NOLOGIN. No crear logins admin en el repo ni pegar passwords aquí.

Checksums V3–V9 pinneados por la matriz 002F (SHA-256 hex de bytes de archivo, no el checksum Flyway CRC):

| Versión | SHA-256 |
|---|---|
| V3 | `0D2CEBE1FBA3D43C1C33E2EA216B5D931EA57D510B967D7C471BBB8B87A65DC8` |
| V4 | `EB677AE41202961AA1527B4AD0539A344A2620E75079241AEE9BA356209A4C5F` |
| V5 | `B27C38CCDB6BAAAAB689197A948C96567BB20CC8BFE7E363DD51FF3ADE34220A` |
| V6 | `BC06A1F0C1CDB51A6737E972C2FDC0777C9206F624EF73D70C2F0B8CADD9EB6D` |
| V7 | `6444ADB440C4B7DC8536F4BA9856AC9C041742CA67EFB91C03EC6409B5398A0C` |
| V8 | `359CE72F8A7E8041D65DCC545440ADDE4F2F43D72160C922CD88E40110249E2C` |
| V9 | `23615A62517151177ADE5C8E62644EA6540C30CC6D32ADD0A29E95AB8E378F3A` |

Si el archivo local no coincide, **no migrar**. V1/V2/V10 se revalidan con `flyway_schema_history` y el árbol del SHA de integración, no con un pin inventado aquí.

## Ventana V3 (ya cerrada en V8; no repetir a mano)

V8 es la unidad atómica: REVOKE de las cuatro firmas V3 a PUBLIC/`storecore_runtime` + instalación de Tx-C. No aplicar ese REVOKE en un deploy separado del artifact que contiene V8–V10.

- **Instalación limpia:** Flyway V1→V10 en un solo arranque. Companion y capability quedan `DISABLED`.
- **Upgrade desde V7:** backup → artifact que incluye V8–V10 → un migrate. No dejar un proceso escuchando que aún dependa de EXECUTE V3 de runtime mientras V8 ya corrió: el adapter HTTP residual **sí** sigue emitiendo esas llamadas; en un login runtime real fallarán (42501). Eso no se “arregla” re-otorgando V3. El arreglo es el residual 002B (Tx-S + `capability_tx_c_execute` en pool admin).
- No `flyway undo`. No re-GRANT V3 a PUBLIC/runtime.

## Provider y pools admin (por referencia, no implementados)

`application.yml` de integración sólo declara el datasource runtime (`STORECORE_DB_URL` / `STORECORE_DB_USERNAME` / `STORECORE_DB_PASSWORD`). **No hay** todavía:

- pool JDBC capability-admin (login miembro sólo de `storecore_capability_admin`);
- pool JDBC companion-admin (login miembro sólo de `storecore_companion_admin`);
- `CompanionSecretProvider` de instalación (prepare/resolve/discard por `requestId`);
- rutas internas `/internal/admin/blackstore-companion/*`.

Cuando existan, las URLs y credenciales salen del secret manager de la VM, nunca del repo ni del body HTTP. Nombres de referencia (no valores):

| Recurso | Rol DB efectivo | Uso |
|---|---|---|
| runtime DS actual | `storecore_runtime` | HTTP público, guards, saga |
| capability-admin DS (futuro) | `storecore_capability_admin` | sólo `capability_tx_c_*` |
| companion-admin DS (futuro) | `storecore_companion_admin` | sólo `companion_admin_*` |
| secret ref del bearer | fuera de DB | `credential_secret_ref`; el token plano no se persiste |

Fail-closed: si el pool admin falta, el comando admin no se ejecuta y el intent queda recuperable. Hoy ese camino HTTP no existe; no simularlo con `SET ROLE`, superuser de app, ni SQL manual desde el runtime.

El puerto de secretos de BlackStore sigue siendo `settings.tokenRef` + `resolveToken`. StoreCore no introduce prefijo `scbs1` ni claims parseables.

## Apagar, revocar y PENDING — evidencia vs operador

Demostrado en tests POSC-002E/002F (PG16 + loopback), no como runbook HTTP de operador:

| Acción | Evidencia | Operador hoy |
|---|---|---|
| Kill en reserve/commit/release | 002F: niega sin claim/ledger; reserved stock no se toca en kill-on-commit | Rutas `/api/v1/user/capabilities/{module}/kills*` existen, pero el adapter llama firmas V3 revocadas a runtime |
| DISABLE antes de GET | 002F: 403/denegado, sin writes | Idem capability HTTP residual |
| Revoke entre Tx-A y Tx-B | 002F: PENDING recuperable, sin reserve | `companion_admin_revoke` existe en SQL; sin HTTP admin |
| Recover/abort PENDING | Tx-C `capability_tx_c_status` / `abort` y Tx-P `companion_admin_command_status` / `abort_command` | Sin controller ni Tx-S durable en el adapter |

No ejecutar esas funciones como superuser de aplicación para “operar” una VM. No activar el módulo para probar kill en producción.

## Rollback

Rollback = dump conocido-bueno + artifact compatible. Ver `fleet-operations.md`.

| Situación | Acción |
|---|---|
| Artifact y Flyway coinciden con el dump pre-V8 | Restaurar dump, desplegar artifact V7 |
| Flyway ya en V8–V10 y el artifact viejo no lee el esquema | Bloquear. Dump forense. No `flyway undo` |
| Health down post-restore | Conservar dump forense. No reescribir ledger/inbox/sagas |
| Se re-otorgó V3 a runtime “para desbloquear HTTP” | Tratarlo como incidente. Revocar de nuevo. No es rollback |

Tras restore: health UP, `installation_id=1`, Flyway del par artifact/dump, un smoke login USER y uno CUSTOMER. No pegar credenciales aquí.

## Observabilidad (sin secretos)

Permitido en catálogo de operador: artifact id, Flyway version, `GET /api/v1/health`, Actuator health, `module_configurations.state` de `BLACKSTORE_INTEGRATION` (esperado `DISABLED`), conteo de companions no-REVOKED (0 o 1), `traceId` de `BaseResponse`, pids/locks de incidente.

Prohibido: bearer, `credential_secret_ref`, CSRF, passwords JDBC, bodies de reserve/commit, emails, tokens MP.

GET `/blackstore-integration/v1/openapi.yaml` es público; el digest pinneado permanece `7B907A2E11C52A66B7253407FB3F9450CAE7B792BECCF34C1636BE9D3945DE30`. No editar YAML en un hotfix de rollout.

## Transferencia al siguiente corte

POSC-002G transfiere el inventario anterior. **No** declara dependencia cumplida hacia POSC-003.

Siguiente trabajo autorizado sobre el mismo WIP, sin `sdd.finish`:

1. Residual **002B HTTP/Tx-S**: intent durable, CSRF consume/rota, correlation obligatoria del cliente (retirar `UUID.randomUUID()` de `CapabilityController.changeState`), pool capability-admin, `capability_tx_c_execute` en lugar de las cuatro firmas V3.
2. Residual **002C HTTP/provider**: nueve entry points companion + CSRF + secret provider de instalación.
3. Recién entonces reabrir el gate de POSC-003 (catálogo/reserve). POSC-004/004A, PIC-006A, conector live, fiscal y `sdd.finish` conservan gates propios.

ML RR y `INSERT(variant_id)` siguen residuales explícitos.
