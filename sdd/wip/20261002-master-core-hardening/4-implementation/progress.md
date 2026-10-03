# Promoción core homologable a master — progreso

## Identidad del corte

- PR: `#152`, draft.
- Base: `master@6831a135e9cb74627b995ca6f4472f757416b3f3`.
- Rama: `homologation/master-core-hardening`.
- Head auditado inicialmente: `ba3eb8e9ac4d5f65fbaf25c223d6417e49c05422`.
- El SHA final cambia con las correcciones de review/CI y debe volver a validarse; este archivo no autoriza merge.

## Procedencia y adaptación

- `ac79b1f`: Angular 22.2 y lockfile.
- `6234e7e` + `5bf17cd`: frontera de dominio y composition root adaptados a las capacidades presentes en master.
- `26b41b5`: roles internos cerrados/fail-closed, excluyendo hunks ML/integración ausentes del baseline.
- `08b9565`: estrategia master/release documentada.
- `ba3eb8e`: fixtures USER alineados con roles cerrados y regresiones de Unknown/aislamiento de realms.

Los WIP importados conservan la historia del trabajo fuente sobre `integration/storecore-int`; no son por sí solos evidencia de esta promoción ni convierten el CI de PR #135 en verde para master.

## Alcance y exclusiones

El corte incluye seguridad Angular, separación dominio/framework, composition root y roles cerrados. No agrega DDL, migraciones, adapter, configuración, secreto ni activación operativa StoreCore↔BlackStore. El soporte local ya presente en master conserva su historia. POSC/DSP/companion permanecen en integración y sólo se prepararán en `release/1.0` tras homologar facturación/ARCA y Correo Argentino.

## Evidencia del corte

- Local sobre `ba3eb8e`: `npm ci` con 0 vulnerabilidades; arquitectura 6/6, lint y build PASS.
- Unit tests y Maven locales: BLOCKED por ACL/ownership del runner Windows; no se contabilizan como PASS.
- GitHub Verify `37083606853`: arquitectura, lint, 25 archivos/67 tests y build PASS. Frontend FAIL porque `verify` lanzó Playwright antes del paso de instalación de Chromium; backend continuaba en ejecución al registrar esta evidencia.
- Corrección: `verify` queda limitado a arquitectura, lint, unit tests y build. El workflow instala Chromium y ejecuta `test:a11y` en el paso dedicado posterior.
- GitHub Verify `37083852538`: arquitectura, lint, 67 tests, build e instalación de Chromium PASS; accesibilidad 4/5 PASS. La ruta `/` falló antes de axe porque el fixture esperaba un título histórico y la pantalla vigente renderiza `Inicio`. Se alineó la expectativa con el contrato visible actual; requiere rerun completo sobre el nuevo head.
- GitHub Verify `37084138782`: frontend completo PASS (arquitectura, lint, 67 tests, build, Chromium y 5 rutas a11y). Backend detectó dos defectos de composición/test: el transporte Apache de `IdentityHttpIntegrationTest` reintentó automáticamente el primer `429` respetando `Retry-After: 900`, y el smoke sin DataSource intentó construir seis beans JDBC BlackStore aun con identidad deshabilitada.
- Correcciones backend: el test HTTP usa un request factory sin reintentos y demuestra sexto y séptimo `429` inmediatos con `Retry-After` positivo; el grafo de infraestructura/aplicación BlackStore comparte la frontera `storecore.identity.enabled` ya utilizada por su controller, sin introducir Spring en dominio ni mocks JDBC en el smoke test. Requiere Verify completo sobre el nuevo head.

## Gates pendientes

- GitHub Verify completo y verde sobre el head final, incluido backend y accesibilidad.
- Repetir reviews GPT-6.1 Sol sobre el head final y resolver todo P0–P3.
- Dos reviews Grok 4.7 `APPROVED` sobre el diff final, exigidas por el repositorio. Las reviews Sol no las sustituyen.
- Close-out SDD honesto sin archivar WIP de integración ni declarar `release/1.0` listo.
