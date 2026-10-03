# Especificación funcional

La aplicación conserva las mismas pantallas, rutas y comportamientos. La actualización sólo elimina vulnerabilidades conocidas del toolchain/runtime Angular.

## Aceptación

- El lock instala sin `--force` ni `--legacy-peer-deps` mediante `npm ci`.
- `npm audit` informa cero vulnerabilidades conocidas.
- Arquitectura, lint, compilación de specs, build y Verify alojado conservan éxito.
- No se introduce ni activa ninguna capacidad de producto.
