# Especificación funcional

La aplicación conserva las mismas pantallas, rutas, accesibilidad y comportamientos. La actualización sólo elimina vulnerabilidades conocidas del toolchain/runtime frontend y deja una instalación reproducible desde el lock.

## Aceptación

- El lock instala sin `--force` ni `--legacy-peer-deps` mediante `npm ci`.
- `npm audit --json` informa cero vulnerabilidades conocidas con el registro vigente al momento del PR.
- El runtime de Node declarado, usado localmente y usado por CI satisface sin `EBADENGINE` los engines de Angular final.
- Arquitectura, lint, tests, accesibilidad, compilación y build conservan éxito local y alojado.
- La actualización no altera capturas, rutas, contratos, contenido ni interacción visible.
- No se introduce ni activa ninguna capacidad de producto.
