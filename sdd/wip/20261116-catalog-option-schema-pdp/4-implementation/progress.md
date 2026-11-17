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
