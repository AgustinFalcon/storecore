# Progreso — 2026-10-01

- PASS: `npm ci` sin flags de resolución; 404 paquetes instalados.
- PASS: `npm audit --json`; 0 vulnerabilidades.
- PASS: architecture scan y lint mediante `npm run verify` antes de tests.
- PASS: `npx tsc --noEmit -p tsconfig.spec.json`.
- PASS: `npm run build`.
- BLOCKED: `npm test`; Angular falla antes de assertions al resolver rutas por ACL del workspace Windows. No se cuenta como pass ni fallo funcional.
- Pendiente: Verify alojado y reviews finales.

La generación inicial del lock necesitó `--legacy-peer-deps` para reemplazar atómicamente el lock 22.0.x, pero el lock resultante se validó después con `npm ci` normal. No se conserva ningún bypass de peers en scripts o configuración.

# Reapertura — 2026-11-14

- El lock de `master@b768ce4` volvió a quedar afectado por advisories publicados después de la evidencia histórica: 16 vulnerabilidades (`1 low`, `10 moderate`, `5 high`, `0 critical`).
- Las cadenas alcanzan Angular build/CLI, Vite/Vitest, MCP/Zod y `typescript-eslint`/`minimatch`.
- El registro ofrece Angular runtime `22.2.6`, CLI/build `22.2.7`, `angular-eslint 22.6.0`, Vitest `4.1.12` y `typescript-eslint 8.72.2` como estables compatibles.
- `typescript-eslint 8.72.2` sigue resolviendo `minimatch ^10.2.2`, mientras el advisory exige `>=11.0.1`; sólo existe una canary posterior. No se usarán prereleases ni un override mayor sin revisión de seguridad y compatibilidad completa.
- Próximo gate: revisión paralela del SDD antes de modificar manifest o lock.
- REVIEW: release/funcional aprueba la estrategia condicionada a override acotado, smoke dirigido y suite completa.
- REVIEW P2 resuelto en especificación: seguridad detectó que `package.json` permitía Node 20/22.12 mientras Angular exige `^22.22.3 || ^24.15.0 || >=26.0.0`; manifest y CI deben alinearse.
- REVIEW: seguridad permite ensayar exclusivamente el override de `minimatch 11.0.1` bajo `@typescript-eslint/typescript-estree@8.72.2`, con inspección del árbol, audit cero, smoke del consumidor y gates Windows/Linux.
- IMPLEMENTED: Angular runtime/compiler `22.2.6`, CLI/build `22.2.7`, `angular-eslint 22.6.0`, `typescript-eslint 8.72.2`, Vitest `4.1.12`; no se seleccionaron prereleases directos ni overrides prerelease.
- IMPLEMENTED: `engines.node` y los dos jobs Node de CI quedaron fijados en el mínimo compatible `22.22.3`.
- IMPLEMENTED: override acotado `typescript-estree 8.72.2 -> minimatch 11.0.1`; ESLint conserva `minimatch 3.1.5`.
- PASS: `npm ci` normal; 436 paquetes instalados sin `EBADENGINE`.
- PASS: `npm audit --json`; 0 vulnerabilidades en 559 dependencias contabilizadas.
- PASS: árbol explícito (`npm ls`): sólo `typescript-estree` consume el override 11.0.1; ESLint conserva su rama 3.1.5.
- PASS: smoke dirigido Windows 3/3: archivo admitido obtiene `Program` y type checker; archivo fuera de `allowDefaultProject` se rechaza; el `minimatch` resuelto desde el consumidor conserva API, semántica `dot` y rechazo de anidados. Linux queda exigido por CI.
- PASS: Verify local final: arquitectura 9/9, lint, 207 archivos / 1403 tests y build de producción.
- PASS: Playwright completo 155/155, incluidas las 29 rutas productivas en mobile/desktop y accesibilidad.
- NOTA: una primera matriz no lanzó navegador porque la regeneración había permitido Playwright 1.65.1 dentro del rango amplio. Se fijaron Playwright 1.63.0, axe 4.13.0 y tslib 2.8.1 a las versiones del lock anterior; la repetición completa aprobó 155/155.
- SUPPLY CHAIN: tarball oficial e integridad de `minimatch 11.0.1` coinciden con el registro; no declara script de instalación. Sus dependencias nuevas son `@isaacs/nonrecursive-glob-match` y `brace-expansion`.
- SUPPLY CHAIN EXCEPTION: el fallback opcional WASM de `@angular/build 22.2.7` agrega `@emnapi/core` y `@emnapi/runtime 2.0.0-alpha.6`. Son subdependencias exactas del paquete estable, con tarballs e integridades del registro oficial, sin scripts de instalación; no son los bindings nativos ejercitados por Windows/Linux.
- SUPPLY CHAIN INSTALL: `msgpackr-extract 3.0.7`, opcional, ejecuta `node-gyp-build-optional-packages` para seleccionar binarios por plataforma. Su tarball e integridad son del registro oficial y no incorpora descarga shell arbitraria.
- REVIEW FINAL: Bugbot/release y Security aprueban el diff exacto sin hallazgos P0–P3 después de documentar la excepción WASM; Linux/CI permanece como gate de release.
- PASS FINAL: Verify repetido con el smoke 3/3 exacto; arquitectura 9/9, lint, 207 archivos / 1403 tests y build.
