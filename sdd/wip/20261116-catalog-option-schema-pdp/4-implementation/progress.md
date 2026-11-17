# Progreso

## 2026-11-16

- Issue #10 y baseline auditados.
- Confirmado: attributes/attribute_order y selector genérico existen; schema,
  ejes select/swatch y búsqueda por nombre de categoría no existen.
- Specs funcional/técnica creados para revisión; sin código ni migración.
- Primera revisión paralela Astra Product/UX y Security: NO-GO (sin P0; P1/P2
  sobre Absent, selección parcial, writer único/CAS, búsqueda y rollback).
- Specs corregidas; pendiente segunda revisión exacta antes de generar tareas.
- Segunda revisión paralela: NO-GO por ruta pública incorrecta, persistencia no
  ejecutable en PostgreSQL, DTO de operaciones incompleto, interlock legacy e
  intención recuperable tras recarga.
- Segunda corrección aplicada con vector/guard diferible, comando cerrado,
  interlock externo obligatorio y tombstone durable. Pendiente tercera revisión.
- Rondas tres y cuatro corrigieron compatibilidad `Absent`, captura de intención,
  Clear y búsqueda SKU. Hashes finales aprobados por Product/UX y Security, sin
  P0–P3: funcional `38975151`, técnica `815F618D`.
- Plan de 14 tareas generado y aprobado por el owner mediante instrucción de
  continuidad total. Sin implementación runtime en este PR documental.
- Exact-head detectó un nivel no topológico y una ruta Angular obsoleta en la
  matriz; ambos fueron corregidos antes del gate final.
- TASK-001 implementada en Kotlin y TypeScript: tipos cerrados, traducción wire
  única y fail-closed, snapshots inmutables, límites compartidos, unicidad Unicode
  y pasos de flujo independientes.
- Base pura de TASK-006 implementada sin marcar la tarea completa: resolución
  determinista parcial/completa, combinaciones imposibles, cantidad, precio/stock
  y fallback genérico exclusivo para `Absent`. Tombstones e integración PDP siguen
  pendientes.
- Evidencia local del corte: `OptionDomainTest` 8/8; frontend 74/74; ESLint focal
  limpio; build Angular completo exitoso.
- Dos rondas de revisión GPT-6.1 Sol corrigieron cuatro hallazgos P2 y un P3:
  case-fold `ß/ẞ`, singletons mutables, variante ajena en `withQuantity` y rangos
  numéricos divergentes. Ronda final de arquitectura y seguridad: APPROVE, sin
  P0–P3 pendientes. La aprobación cubre sólo dominio/motor aislados.
- TASK-002 implementada con Flyway V24: presencia/revisión acotada, ejes,
  valores, asignaciones con ownership compuesto, vectores JSONB completos y
  únicos de forma diferible, guard coalescido y validación integral al commit.
- La migración conserva los productos legacy como `Absent`, no infiere opciones
  desde `attributes`, no genera vectores vacíos y mantiene precio, stock e
  historial. La matriz PostgreSQL 16 cubre clean/upgrade, staging, swaps,
  rollback, límites, pertenencia, concurrencia y reparación de vectores.
- Se agregó compatibilidad de artefacto fail-closed: marcador de base V2,
  declaración embebida, migrador Flyway offline y wrapper Linux obligatorio. La
  secuencia drena, migra clean/V23 sin servir tráfico y sólo admite la aplicación
  si marcador y artefacto coinciden; además fija la datasource efectiva y
  rechaza overrides que pudieran eludir el preflight.
- Evidencia local focal tras corregir el protocolo de despliegue: matriz
  PostgreSQL con 44 pruebas, 0 fallos y 0 errores; la suite final del interlock
  compila y sus 7 casos de shell se omiten en Windows por diseño, reservados al
  runner Ubuntu de CI. El fat JAR construye y el entrypoint offline fue cargado
  mediante `PropertiesLauncher` sin iniciar Spring. La
  equivalencia Unicode de labels queda explícitamente en TASK-003 y cualquier
  dato no validado fallará cerrado en TASK-004.
- TASK-003 implementada con parser cerrado y acotado, endpoint ADMIN CAS,
  locks producto→variantes, operaciones `Replace/Clear/Keep/AddInactive/
  Activate/Deactivate`, auditoría redacted y rotación CSRF sólo al commit.
- `saveProduct` participa del mismo protocolo transaccional: preserva actividad
  con schema válido, fuerza altas inactivas, incrementa revisión por membresía o
  actividad y revierte íntegramente ante revisión agotada o límite de variantes.
- El GET administrativo traduce presentación con tipo cerrado y falla cerrado a
  `UNKNOWN` ante datos persistidos corruptos; no publica labels/colors crudos de
  un schema inválido.
- Evidencia local TASK-003: blast-radius de dominio, migración V24, parser y HTTP/
  PostgreSQL con 41 pruebas, 0 fallos y 0 errores; suite HTTP ampliada 14/14 con
  CUSTOMER/OPERATOR/ADMIN, capability, origin/CSRF, ownership 404, revisión
  agotada, concurrencia CAS, límite 1.000, activación/desactivación y rollback.
- Dos revisiones GPT-6.1 Sol: APPROVE sin P0–P3. La revisión de cobertura pidió
  casos negativos adicionales; se incorporaron, quedaron verdes y fueron
  revalidados antes del commit publicado. CI del PR sigue siendo gate separado.
- TASK-004 implementada con proyector puro fail-closed compartido por catálogo y
  lectura administrativa. El wire público agrega `optionSchema` y cada variante
  agrega `optionValues`; sólo `ABSENT` habilita fallback, mientras corrupción,
  identidad/SKU inválida, ownership inconsistente o presentación futura producen
  `UNKNOWN/CORRUPT` sin publicar labels, colores ni asignaciones crudas.
- El reader valida primero el agregado completo —incluidas variantes inactivas—
  y recién después aplica visibilidad. Dos consultas bulk con centinelas fijan
  el presupuesto en seis consultas por página no vacía y cinco por detalle, sin
  N+1 ni truncamiento; admin aplica los mismos límites de 4 ejes, 50 valores por
  eje, 1.000 variantes y 4.000 asignaciones.
- Evidencia local TASK-004: compilación backend completa y matriz focal con 28
  pruebas, 0 fallos y 0 errores (16 HTTP/PostgreSQL, 8 dominio, 4 proyector).
  Dos revisiones GPT-6.1 Sol cerraron dos P2 de límites/ownership y aprobaron la
  cabeza corregida sin P0–P3. La matriz final de blast radius TASK-002/003/004
  pasó 47/47 (suma 13 migración V24 y 6 parser). CI del PR continúa como gate
  independiente.
- TASK-005 implementada con `CatalogSearchTerm` como frontera única normalizada,
  acotada y literal. Público y admin comparten el mismo predicado y argumentos
  para `count`/items; nombre, SKU case-insensitive y categoría nullable usan
  parámetros y `EXISTS`, sin duplicar productos ni ampliar resultados con `%`
  o `_`. Público conserva producto/variante activos; admin conserva visibilidad
  autorizada bajo `CATALOG/READ`.
- Angular transporta los mismos criterios en storefront y consola, reinicia la
  página cuando cambian filtros, conserva criterios al paginar y descarta
  respuestas antiguas. La consola distingue filtros editados de resultados
  aplicados y limita el input visible a 120 caracteres.
- Evidencia local inicial TASK-005: 19 pruebas backend verdes (17 HTTP reales
  con PostgreSQL 16 y 2 del value object) y 30 pruebas Angular focales verdes.
  Incluye dos páginas por categoría, SKU con distinto case, comodines literales,
  categoría nullable por construcción, límite 120/121 y SKU inactivo visible
  sólo en admin. Dos revisores GPT-6.1 Sol no encontraron P0/P1 de diseño luego
  de incorporar sus controles; revisión exact-head final permanece separada.
- Gate local ampliado TASK-005: matriz backend TASK-002→005 50/50, suite
  Angular completa 1.551/1.551 en 219 archivos y build Angular de producción
  exitoso. El port legacy `searchActive` también reutiliza el mismo traductor y
  patrón literal para no mantener una segunda superficie permisiva.
- La revisión exacta Sol detectó y cerró tres P2 y un P3: recovery admin obsoleto,
  dependencia domain→application, falta de dos páginas HTTP admin y whitespace
  Unicode divergente. Tras las correcciones, 29/29 pruebas Angular afectadas y
  19/19 backend HTTP/value-object volvieron a pasar. Ronda final de arquitectura
  y seguridad: APPROVE, sin P0–P3 pendientes; CI hosted queda como gate del PR.
- TASK-006 completada: el wire de detalle traduce `optionSchema` y
  `optionValues` una sola vez; `ProductPageViewComponent` reconstruye
  `OptionSelectionEngine` ante cada snapshot y deriva identidad, precio, stock,
  cantidad y submit de su resultado cerrado. `Unknown` y vectores parciales
  bloquean; sólo `Absent` habilita selección genérica.
- Cambiar opción suspende primero el intent durable, invalida claims, persiste un
  tombstone `RETIRED` y retira `resume` sincrónicamente antes de aplicar el cambio.
  Un fallo de lectura, escritura, limpieza de emergencia o History bloquea la
  selección. Una acción explícita posterior crea otro `flowId`; callbacks y
  reconciliaciones tardíos verifican resultado, flow y revisión.
- Evidencia final TASK-006: 41/41 pruebas focales de PDP/intent/storage, suite
  Angular 1.563/1.563 en 219 archivos y build productivo exitoso. El PDP se movió
  a carga diferida: bundle inicial 681,19 kB, sin exceder el presupuesto. Dos
  revisiones GPT-6.1 Sol (arquitectura y seguridad) aprobaron el diff final sin
  P0–P3. Los controles Select/Swatch y Axe siguen exclusivamente en TASK-007.
- TASK-007 completada con controles nativos Select y radio/Swatch derivados del
  tipo cerrado `OptionPresentation`. Labels, motivos deshabilitados, texto de
  color, cantidad, mensajes parciales/desconocidos y reintento mantienen
  semántica accesible; una selección parcial retira SKU, precio, favorito y
  submit antiguos sin autocompletar combinaciones.
- Elegir otra variante conserva cantidad aunque exceda su stock y vuelve a
  validar compra; los errores tardíos de favoritos quedan acotados al SKU y no
  contaminan catálogo, mientras la vista general conserva su feedback. Carga y
  error retiran identidad de compra, y un rechazo de intención restaura el valor
  nativo autoritativo.
- Evidencia final TASK-007: 1.572/1.572 pruebas Angular en 221 archivos, matriz
  focal 18/18, Playwright 6/6 en 390/768/1.440 con cuatro ejes y etiquetas de 80
  caracteres, teclado Tab/Space, Axe sin impactos serious/critical y sin
  overflow. Lint, arquitectura, smoke de servicios y build productivo pasan.
  GPT-6.1 Astra UX/Product y GPT-6.1 Sol técnico/seguridad aprobaron la cabeza
  final sin P0–P3 pendientes. CI hosted permanece como gate independiente.
- TASK-008 completada con editor ADMIN independiente, lectura OPERATOR,
  borrador/base/remoto separados, CAS y diff/reaplicación explícita tras 409,
  Clear confirmado, reconciliación de resultado incierto y operaciones cerradas
  Keep/AddInactive/Activate/Deactivate. La vista no usa strings mágicos para las
  fases ni operaciones.
- Evidencia final TASK-008: build, lint, arquitectura 9/9, smoke 3/3, matriz
  focal 12/12, suite Angular 1.584/1.584 en 224 archivos y Playwright/Axe 4/4 a
  390/768/1.440 sin overflow ni impactos serious/critical. GPT-6.1 Sol técnico y
  GPT-6.1 Astra UX/Product aprobaron sin P0–P3. El PR #293 y su CI hosted siguen
  siendo gates independientes; no se declara merge.
- TASK-009 completada con preflight streaming antes de materializar JSON. El
  borde rechaza estructuras, propiedades, cardinalidades y strings fuera de
  contrato, conserva el límite binario de 2 MiB y delega la traducción semántica
  al dominio. Los límites probados son 4 ejes, 50 valores por eje, 1.000
  operaciones de variante, 4.000 asignaciones y 4 valores por vector.
- La matriz HTTP/PostgreSQL prueba el agregado máximo real mediante escritura y
  lectura pública/administrativa: 1.000 variantes activas y 4.000 pares, con
  vectores extremos exactos. El presupuesto observado fue un payload de 134.376
  bytes, escritura de 1.634 ms, lista de 49 ms con 6 consultas y detalle de
  40 ms con 5 consultas. También cubre duplicados inactivos, rechazo atómico al
  activar combinaciones duplicadas o incompletas y activación posterior válida.
- La regresión comercial demuestra `Absent → Replace → Clear` preservando
  override de precio, atributos, orden, inventario, carrito y orden pagada. La
  matriz focal terminó 28/28; la suite backend exact-head terminó 513 tests,
  0 fallos, 0 errores y 7 omisiones correspondientes al interlock shell Linux
  que se ejecuta en CI Ubuntu. GPT-6.1 Sol técnico y GPT-6.1 Astra UX/Product
  aprobaron la cabeza corregida sin P0–P3. CI hosted y PR permanecen como gates
  separados; no se declara merge.
- TASK-010 completada con journeys browser deterministas de comprador y consola.
  El producto simple `Absent` no muestra selector redundante, conserva cantidad
  a través del acceso CUSTOMER y confirma exactamente un PUT de carrito con el
  SKU/cantidad visibles. El escenario no cartesiano conserva el sufijo compatible,
  retira SKU/precio/favorito/submit antiguos y prueba el tombstone en un documento
  nuevo antes de permitir una intención explícita distinta.
- El editor ADMIN prueba 409→GET remoto→elección→reaplicación explícita→segundo
  PUT con revisión nueva; conserva el reordenamiento remoto independiente y la
  etiqueta local elegida. La búsqueda transporta nombre, SKU secundario y
  categoría en público/admin y demuestra que un SKU de variante inactiva sólo
  aparece en consola.
- Evidencia exacta TASK-010: 17/17 Playwright con cero retries; matriz 0/1/2/4
  ejes a 390/768/1.440, overflow controlado y Axe sin impactos serious/critical.
  ESLint focal, suite Angular 1.584/1.584 en 224 archivos y build productivo
  pasan. GPT-6.1 Astra UX/Product y GPT-6.1 Sol técnico aprobaron el diff final
  sin P0–P3. CI hosted y PR son gates separados.
