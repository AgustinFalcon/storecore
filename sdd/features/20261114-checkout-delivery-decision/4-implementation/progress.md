# Progreso — decisión de entrega en checkout

## 2026-11-14

- Auditados backend, frontend, esquema, idempotencia y pago actuales.
- Confirmado que `module_configurations` es la fuente versionada reutilizable.
- Specs listos para revisión coordinada antes de implementación.
- Revisión coordinada de specs funcional/producto y técnico/seguridad cerrada con APPROVE tras resolver hallazgos P1/P2.
- Implementada la configuración `MANUAL_FULFILLMENT` schema 2 con validador V22, migración legacy fail-closed, administración CAS, sesión/CSRF y auditoría.
- Implementados tipos cerrados, selección de retiro/entrega local, replay-first, bloqueo de configuración, total ARS exacto, snapshots y ciclos independientes de fulfillment/RMA.
- Implementada la experiencia comprador/administrador con selección congelada, recuperación explícita, retiro sin dependencia de domicilio y proyecciones históricas Known/LegacyMissingBlock/Invalid.
- Corregida la fixture postventa para declarar explícitamente `LEGACY_MISSING_BLOCK`; no se debilitó el traductor productivo.
- Aislada la identidad del escenario E2E de estados futuros para respetar el presupuesto productivo de cinco envíos de credenciales sin modificar el rate limiter.
- Review de implementación coordinado solicitó cambios: contexto autoritativo de
  carrito/dirección, presentación fail-closed del snapshot inválido y aceptación
  browser real de retiro/envío con costo positivo.
- Incorporadas revisiones cerradas al comando, validación bajo locks antes del
  primer reclamo, recarga explícita ante `CHECKOUT_CONTEXT_CHANGED`, presentación
  de decisión inválida y escenario browser real de retiro completo.
- Corregido el recorrido browser para seleccionar explícitamente los contextos
  cliente y operador cuando ambas sesiones verificadas conviven; no se mezclan
  cookies ni autoridades entre realms.
- Rerevisión final coordinada funcional/producto, técnica y seguridad: tres
  `APPROVE`, sin hallazgos P0–P3.
- PR #272 fusionado en `master` como `bfe34661`. Verify del PR `43551669169`
  y post-merge `43552311370`: backend, frontend y E2E real 3/3 verdes.
- SDD cerrado con 13/13 tareas completas y trasladado de `wip` a `features`.

## Evidencia local

- Backend: `mvn test` — 437 pruebas, 0 fallas, 0 errores; migraciones V1→V22; `BUILD SUCCESS`.
- Frontend: `npm run verify` — arquitectura y lint verdes, 206 archivos/1400 pruebas, build productivo verde.
- Showcase: `npm run showcase:test` — 74/74.
- Contrato UA real estático: 23 casos listados y TypeScript/Node válidos.
- Playwright visual/accesibilidad: 96/96 con 4 workers; cobertura 390/768/1440, Axe, teclado y reflow.
- E2E real con PostgreSQL/backend/proveedor/HTTPS/browser: 23/23; incluye entrega local con costo positivo,
  retiro sin dirección, pago observado, transiciones, recarga y RMA; recursos descartables eliminados al finalizar.
- Empaquetado backend: `mvn -B -DskipTests package` — `BUILD SUCCESS`.

