# Especificación técnica

- Alinear Angular runtime y compiler en la última patch estable compatible `22.2.x`; CLI y build en su última patch estable `22.2.x`.
- Regenerar `package-lock.json` a partir del manifest revisado.
- Mantener `@angular/animations` fuera de dependencias directas: no tiene imports ni configuración en `frontend/src` y está deprecado.
- Actualizar sólo patches/minors compatibles de `angular-eslint`, `typescript-eslint` y Vitest que cierren advisories transitivos.
- No actualizar majors de Angular, ESLint, TypeScript, Vitest, jsdom, NgRx o Zone.js en este corte.
- No usar `npm audit fix`; la resolución permanece explícita y revisable.
- No seleccionar prereleases como dependencias directas, targets de actualización ni overrides. Un paquete estable del toolchain puede conservar una subdependencia prerelease opcional sólo si la cadena exacta queda documentada, usa integridad del registro oficial, no es el binding nativo de Windows/Linux probado y supera audit, instalación y CI; no se la usa para ocultar un advisory.
- El único override admisible en este corte es el acotado al consumidor `@typescript-eslint/typescript-estree@8.72.2` hacia `minimatch 11.0.1`; nunca se reemplazan globalmente las versiones usadas por ESLint.
- Añadir un smoke dirigido del parser con `projectService` y `allowDefaultProject`: caso permitido con información de tipos, caso rechazado fuera del patrón, patrones positivo/negativo, archivos ocultos y separadores de ruta Windows/Linux.
- Alinear `engines.node` y los jobs frontend de CI con `^22.22.3 || ^24.15.0 || >=26.0.0`, que es el rango publicado por Angular `22.2.6/22.2.7`; la instalación no puede emitir `EBADENGINE`.
- Documentar el override como temporal y retirarlo cuando `typescript-eslint` publique una estable que dependa de `minimatch >=11.0.1`.
- Excepción transitiva revisada: `@angular/build 22.2.7` estable ofrece el fallback opcional `@oxc-parser/binding-wasm32-wasi 0.156.0`, que fija `@emnapi/core` y `@emnapi/runtime 2.0.0-alpha.6`. Windows/Linux usan sus bindings nativos; si el fallback WASM pasa a ser una plataforma soportada, requiere un gate específico antes de producción.
- Conservar la regla de dominio de tipos cerrados: este corte no introduce strings mágicos ni modifica traductores `fromWire`.
