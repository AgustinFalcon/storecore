# Review Astra — ML desired stock projection

**Fecha:** 2026-09-27
**Objeto:** WIP `20260924-ml-desired-stock-projection` previo a implementación.
**Veredicto recibido:** **NO-GO para código/Flyway**. Este registro conserva los hallazgos transmitidos para la revisión del WIP; las correcciones documentales no convierten el dictamen en GO.

> **HISTÓRICO — NO ES EL GATE VIGENTE.** El dictamen sucesor de TASK-DSP-R00 está en `sdd/reviews/20260927-astra-ml-desired-stock-r00-go.md`; la revisión local de 000A está en `sdd/reviews/20260927-ml-dsp-000a-local-dual-code-go.md`. Este NO-GO se conserva íntegro como evidencia de los hallazgos originales; ningún PR ni release queda aprobado por esos registros.

## Hallazgos que bloquean

1. `TASK-DSP-000` debía fijar base, ancestros y próxima versión Flyway real. La revisión original usó el checkout WIP `a886f488ab908bec7dd86a8c3e514dca2ef8a1d3`. Recheck 2026-09-27 en integración real: HEAD `ab817891abb6c7b710bca809804d924401ed74f0`, `69f209b` es ancestro y el árbol muestra V1–V7 sin V8. V8 es el siguiente número libre en esa base y debe revalidarse si integración avanza.
2. El writer directo PIC-009 sigue pudiendo mutar `desired_quantity` e insertar `LISTING_STOCK` con fixture ACTIVE. Hace falta `TASK-DSP-000A` antes de snapshot/proyector: bridge fail-closed, cero SQL directo, histórico intacto y prueba positiva del fixture.
3. La administración ML V3 y `JdbcCapabilityService.decide` no comparten aún el protocolo de locks del proyector. La solución debe ser migración aditiva V8+, refactor de todos los callers ML y prohibición verificable de bypass.
4. En PG16, `FOR SHARE` requiere privilegio UPDATE. Runtime NOLOGIN no debe recibir UPDATE directo sobre action/config/switch; rutina `SECURITY DEFINER` estrecha para snapshot completo y locks en ese orden, grants efectivos y pruebas permitidas/denegadas con login de prueba. V3 concede EXECUTE administrativo a PUBLIC: V8+ debe revocarlo y cerrar el bypass ML genérico.
5. El CHECK de `channel_outbox` necesita `projection_version IS NOT NULL` explícito para el kind nuevo; SQL CHECK deja pasar UNKNOWN.
6. El inventario de callers debe cubrir reserva WEB de carrito/checkout, consumo MP, release WEB explícito, expiry y ajuste. El orden de locks abarca todas las líneas SKU y las filas orders, MP attempts y reservations; la secuencia actual MP attempt→order→reservation y expiry reservation→balance exige refactor. Se decidió implementar `releaseSaga` interno para terminación MP verificada no pagada. Rollback cubre toda la unidad.
7. Review documental antes de código y dos reviews independientes del PR después; checks locales permiten integrar PRs en rama de integración. Master espera CI remoto verde. Ninguna evidencia de CI bloqueado equivale a pass.

## Disposición del trabajo documental

Los hallazgos se trasladaron a spec funcional/técnica, meta, progreso y DAG de tareas. Sólo el registro documental `TASK-DSP-000` está done; review R00 y todo código siguen pendientes. Se solicita **nueva review Astra del WIP corregido**, con GO/NO-GO explícito sobre integración `ab817891`/V8, snapshot action/config/kill y ACL PG16, callers y orden de locks, y release WEB decidido. Esta disposición documental no cambia el NO-GO recibido ni sustituye R00. ML/BlackStore siguen deshabilitados; no se toca V7/V7.4.2 POS.
