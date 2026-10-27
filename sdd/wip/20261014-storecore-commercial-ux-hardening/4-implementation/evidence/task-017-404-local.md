# TASK-017 — corte 404 Real y Demo

Fecha: 2026-10-15. Estado: implementado y validado localmente; provisional por el gate visual del WIP. Este corte no cierra TASK-017 completo.

## Comportamiento

- Los catch-all Real y Demo renderizan una página 404 explícita y conservan la URL solicitada. Sólo la raíz vacía del runtime Demo conserva el redirect de entrada a `/demo`.
- `NotFoundRecovery` es un tipo cerrado con traductor único y `Unknown`. Define destinos/etiquetas públicos, CUSTOMER y USER por runtime. Las query strings, fragmentos y URLs solicitadas no suministran destinos.
- La recuperación Real respeta los guards existentes. La recuperación Demo permanece bajo `/demo`; las rutas de SC26 y sus guards se conservan en la tabla extraída `demo.routes.ts`.
- La pantalla tiene sección nombrada, encabezado enfocable, enlaces nativos, foco visible y objetivos de al menos 44 px. Real enfoca el encabezado; Demo conserva el foco de su shell sobre el contenido principal.
- El inventario de superficies excluye catch-all `**`, cubiertos por pruebas específicas de error.

## Validación local

- `npm test -- --include=src/app/domain/access/not-found-recovery.spec.ts`: 3/3 PASS.
- `npm test -- --include=src/app/shared/not-found.component.spec.ts`: 4/4 PASS; rutas Real reales con layouts sustituidos por rutas sin componente para aislar los adaptadores HTTP del chrome.
- `npm test -- --include=src/app/demo/not-found-routes.spec.ts`: 6/6 PASS.
- `npx playwright test e2e/not-found.spec.ts e2e/runtime-routes.spec.ts --workers=1`: 7/7 PASS. Real a 390/768/1440, URL preservada, foco inicial, ambos CTA por teclado, guards anónimos hacia login y axe A/AA del componente sin violaciones aplicables.
- `npx playwright test --config playwright.demo.config.ts demo-e2e/not-found.spec.ts`: 3/3 PASS sobre el build Demo generado por el corte SC17 a 20:01 UTC. Cuatro contextos por viewport (público/cuenta/operaciones/fuera del prefijo), ambos CTA por teclado, foco del shell, aislamiento de red y axe del componente.
- `npm run lint`: PASS después de los cambios.
- `npm run check:architecture`: seis pruebas del verificador PASS; el escaneo global informó `features/admin/user.store.spec.ts: production lane cannot register fixtures, Universal Tools or store_id`, fuera de este corte. No se declara PASS global de arquitectura.

La primera ejecución Angular dentro del sandbox falló por resolución de directorios de esbuild; las validaciones se ejecutaron fuera del sandbox. Una corrida previa coincidió con la actualización de tipos SC17 y quedó bloqueada por sus errores transitorios. Una expectativa de test se corrigió para comparar semánticamente la URL, ya que Angular serializa las barras del query param.

## Límites

No se modifican backend ni respuesta HTTP del hosting; es un estado 404 del router frontend. No se cierran los restantes estados transversales, acceso denegado ni diálogos de TASK-017. Axe se acotó a `sc-not-found`; no certifica el shell completo. No se declara aprobación visual final, cierre del feature, homologación, CI remoto, commit ni despliegue.
