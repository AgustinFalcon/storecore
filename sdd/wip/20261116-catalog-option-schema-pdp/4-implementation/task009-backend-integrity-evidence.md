# TASK-009 — Backend integrity and resource bounds

Fecha de evidencia: 2026-11-17.

## Contrato probado

- El límite de 2 MiB se evalúa antes de parsear el documento.
- Un preflight streaming cerrado valida forma, tipos, propiedades conocidas,
  strings de hasta 2.048 code points y cardinalidades antes de `readTree`.
- El dominio sigue siendo el único traductor semántico de estados y operaciones.
- Los máximos admitidos son 4 ejes, 50 valores por eje, 1.000 variantes,
  4.000 asignaciones y 4 valores de opción por variante.

## Evidencia funcional

- Matriz focal: 28 tests, 0 fallos, 0 errores.
- Fixture máximo HTTP/PostgreSQL: 1.000 variantes activas y 4.000 asignaciones.
- Payload observado: 134.376 bytes.
- Escritura observada: 1.634 ms.
- Lista: 49 ms y 6 consultas SQL.
- Detalle: 40 ms y 5 consultas SQL.
- Se verificaron los vectores exactos de la primera y última variante tanto en
  la proyección pública como en la administrativa.
- Un duplicado inactivo permanece oculto; activar una combinación duplicada o
  incompleta responde 400 sin mutación, y una reasignación única sí se activa.
- `Absent → Replace → Clear` preserva precio, atributos, orden, inventario,
  carrito y orden pagada.

Los tiempos son evidencia de esta ejecución local, no un SLA contractual.

## Gate completo

`mvn -q test` terminó con código 0 sobre la misma cabeza y produjo 513 tests,
0 fallos, 0 errores y 7 omisiones. Las omisiones son los casos shell del
interlock reservados al runner Linux; el gate hosted Ubuntu permanece separado.

## Revisiones

- GPT-6.1 Sol, dominio/backend: APPROVE; sin hallazgos P0–P3.
- GPT-6.1 Astra, UX/Product y trazabilidad del contrato: APPROVE; sin P0–P3.

Esta evidencia cierra TASK-009, pero no declara CI hosted, merge ni post-merge.
