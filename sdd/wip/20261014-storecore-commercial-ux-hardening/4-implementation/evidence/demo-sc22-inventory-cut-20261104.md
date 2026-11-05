# SC-SURF-22 — inventario Demo

Base: `8ffc7912233c274f4a74ecdca825f4c86d5440cc`. Fecha: 2026-11-04.
Estado: implementación local verificada y aprobada; sin push, PR, merge,
publicación, backend ni mutaciones Real.

## Alcance

`/demo/user/inventory` opera pools por SKU y deriva cuatro saldos desde snapshot.
Baseline vigente: 17 SKU, `253/1/1/249`; única reserva ORD-1012. Presentaciones son
contexto, no pools independientes. Archivado conserva físico/historia y vendible cero;
Outlet y publicación son ejes separados. Unknown nunca se presenta como cero.

Admin y Operator consultan/operan; otros roles son denegados antes de datos privados y
en comando. Búsqueda/filtros URL, métricas globales y contador filtrado distinguen salud,
publicación y condición. Ajuste usa delta físico; reconciliación, conteo absoluto.
Reservado/no-vendible, condición y publicación permanecen inmutables. No se reutiliza
el ajuste legacy ni se crean syncJobs/efectos ML.

Movimientos nuevos agregan evidencia tipada, actor, fecha, referencia, before/after e
identidad/payload idempotente. Históricos preservan sólo su evidencia real, incluidos
IDs repetidos. SC21 se proyecta sin repetir su disposición. CAS/quota/readback/writer y
actor/epoch conservan rollback y borrador con actualización/revisión explícitas.

## Experiencia y continuidad

Tabla 1440, tarjetas 768 y una columna 390/320; texto 200 %, teclado, Escape, trap y
foco estable. Validación local permite corregir y revisar sin refresh. Retornos tipados
desde Catálogo y pedidos Legacy preservan búsqueda/filtros/foco a través de buscar,
limpiar, paginar y producto guardado. SC26 abre ORD-1015 en el detalle SC21 vigente.

## Gates finales

- Verify: **779 tests PASS**, arquitectura **6/6**, lint y builds Real/Demo PASS.
- Focales: **43/43 PASS**.
- Demo completo: **240/240 PASS**, sin flaky ni skipped.
- Inventario Real read-only: **6/6 PASS**.
- Astra dominio/seguridad: `APPROVE — 0 P0–P3`.
- Astra UX/producto/accesibilidad: `APPROVE — 0 P0–P3`, cuatro anchos y axe sin
  violaciones.

Fingerprint SHA256 de 24 fuentes/E2E:
`36699a7bcd7c48996d7c7dee8e6a059950c3bdf4551ae18768d91177440271b2`.

Evidencia fuera del repo:
`outputs/sc22-20261104-local-review/gates.json` y
`outputs/sc22-20261104-local-review/source-36699a7b.zip`.

## Límites

No implementa integración ML real, backend, almacenes múltiples, facturación,
proveedores ni homologación. Stitch y el gate visual global siguen abiertos.
