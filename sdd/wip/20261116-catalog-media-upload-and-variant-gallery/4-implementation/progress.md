# Progreso

## 2026-11-16

- Issue #7 y baseline single-tenant auditados.
- Confirmado: galería de producto y orden ya existen; upload, ownership de asset
  y vínculo por variante no existen en runtime.
- Especificaciones funcional y técnica creadas para revisión independiente.
- No se creó código, migración, dependencia ni configuración de proveedor.
- Cuatro rondas Astra Product/UX y Security cerradas en APPROVE, sin P0–P3.
- Plan de 15 tareas aprobado por el owner el 2026-11-16 mediante instrucción de
  continuidad total. La implementación queda habilitada en PR separado.
- Exact-head detectó interlock legacy, keyword de cierre y DAG documental; fueron
  corregidos antes del gate final. Cloudinary live continúa sin GO.
- El DAG final ejecuta E2E/CI antes de tres reviews paralelas sobre SHA congelado;
  merge/post-merge sólo se registran después de las tres aprobaciones.

## 2026-11-18 — corte de dominio y almacenamiento privado

- TASK-001 implementada en Kotlin y Angular: estados cerrados, `Unknown`
  fail-closed, IDs/digest/dimensiones/alt/URL/path tipados y seis contratos de
  pasos independientes.
- TASK-004 implementada sin proveedor live: `MediaObjectStore`, resultados
  cerrados, adapter productivo `Unconfigured` y adapter determinista aislado en
  tests. El adapter copia bytes, impide overwrite, exige digest exacto para
  borrar y sólo entrega bytes mediante un grant emitido, exacto y vigente.
- Corpus común Kotlin/TypeScript cubre forma HTTPS canónica, allowlist exacta,
  userinfo/fragmento, dot-segments, UTF-8 inválido, caracteres de formato,
  UUID canónico y enteros seguros de IDs.
- Evidencia focalizada: Maven media `7/7`; Angular media `3/3`.
- Gate frontend completo: arquitectura y smoke aprobados, lint aprobado,
  `225` archivos / `1613` tests aprobados y build productivo aprobado (warning
  preexistente: bundle inicial 705,48 kB contra budget 700 kB).
- La suite Maven completa compiló y alcanzó ejecución, pero el host local no
  tenía Docker disponible: `215` errores de infraestructura Testcontainers,
  `0` failures. El CI alojado deberá ejecutar la evidencia PostgreSQL completa.
- Las reviews coordinadas funcional/código y seguridad aprobaron el snapshot
  corregido sin P0–P3 abiertos.
- No se agregó migración, endpoint, secreto, dependencia de decoder ni adapter
  Cloudinary. El gate externo continúa cerrado.
