# Revisión funcional y SDD — 2026-09-20

**Revisor:** agente independiente (gpt-5.6-sol)  
**Veredicto:** NO-GO para release o inicio de implementación; cerrar TASK-000A..000D.

## Bloqueantes

1. El modelo V1 no es autocontenido: Flyway depende de fuentes históricas contradictorias.
2. `store_id` sin constraints compuestas no evita relaciones cross-tenant.
3. AC/RN/DD, tareas, issues y gates no tienen trazabilidad completa ni un gate final integrado.
4. La gobernanza actual exige auditoría, redacción y allowlist antes de versionar el corpus; el runbook incluye material operativo que no puede publicarse.

## Mejoras obligatorias pre-código

- Separar fuente canónica e histórica, completar diccionario de 20 tablas y rotular el legado.
- Añadir RTM y E2E/gates de integración; corregir dependencias de tareas y referencias de webhook/settings.
- Cerrar RBAC, lifecycle de tienda, cálculo/snapshot de precios y envío, y UX/a11y antes de go-live.
- Etiquetar la versión como **StoreCore SDD Baseline 1.0.0 — pre-coding**, nunca como software ejecutable.