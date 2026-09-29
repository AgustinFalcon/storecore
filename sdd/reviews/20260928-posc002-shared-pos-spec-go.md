# POSC-002 — GO documental Astra acotado al camino POS

- Fecha del dictamen: 2026-09-28.
- Snapshot revisado: d8dc971, propuesta POSC-002 de identidad, capability y ACL.
- SHA-256 de los bytes del spec en d8dc971, verificado con git show y SHA-256: 8187558C06E5DF2C6C41FE9C86D420A8280CA38BBC909FE0743014CF36258025. Los cambios posteriores de estado/gates son un delta editorial y se revisan con el plan.
- Resultado comunicado en la sesión: GO documental Astra para planificar el corte POS compartido. Este registro no sustituye el texto íntegro de la review ni acredita una segunda review independiente.

## Alcance

El corte comprende el cierre de las cuatro firmas administrativas V3 expuestas a PUBLIC/runtime, roles y funciones SECURITY DEFINER estrechas, orden de locks action→config→switch, operaciones mutantes POS READ COMMITTED con lecturas posteriores al ancla, pool administrativo separado, USER ADMIN+CSRF, token opaco con provider, principal y scopes, cuarentena de credenciales V5, y permisos mínimos medidos con logins PG16. El manifiesto incluye INSERT sólo de variant_id en inventory_balances para el INSERT ON CONFLICT DO NOTHING del servicio de inventario.

El usuario autorizó expresamente la migración de permisos y funciones el 2026-09-28. El GO de spec y esa autorización permiten preparar cambios revisables. No acreditan migración aplicada, suite PG16, review de código ni activación del companion.

## Límite ML y base viva

La ruta ML que conserva transacciones REPEATABLE READ aún debe demostrar snapshot nuevo y carrera admin-wins cuando el kill switch estaba ausente. Este GO POS no aprueba cambiar su aislamiento silenciosamente, activar su writer ni marcar TASK-DSP-000B done. El delta de cierre V3 y roles compartidos tendrá un solo owner y versión Flyway; los WIP POS y ML referenciarán el mismo artefacto. Los callers ML sólo reciben GO tras su propia review y prueba específica.

La referencia ab81789 de una revisión ML es un snapshot anterior. Al redactar este registro, origin/integration/storecore-int coincide con 9ce355b y conserva Flyway V1–V7; d8dc971 está tres commits delante de esa base. Antes de asignar V8 o tocar grants se repiten el inventario de flyway_schema_history, objetos, checksum, roles efectivos y wiring de los cuatro endpoints administrativos. Si integración avanza o V8 está ocupado, se adjudica la siguiente versión libre sin editar V1–V7.

## Gate de salida

POSC-002 sigue pendiente hasta que cada subcorte tenga pruebas locales en su SHA final y dos reviews estrictas de código sin hallazgos P0–P2. El plan de subcortes y este registro pasan review documental propia. BLACKSTORE_INTEGRATION permanece DISABLED; este registro no acredita conector live, CI remoto verde, release ni sdd.finish.
