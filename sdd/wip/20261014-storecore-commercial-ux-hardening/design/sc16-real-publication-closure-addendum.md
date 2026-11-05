# SC16 Real — publicación y protección de edición

Fecha: 2026-11-05. Corte de frontend posterior a Demo R8 `0267c78`.

## Contrato reconciliado

La Demo comercial tiene un flujo de borradores local. El contrato Real existente `PUT /user/content/home` escribe el hero activo que lee el home público (`JdbcCatalogService.saveHome` y `home`). Cambiar su etiqueta a «Guardar borrador» describiría un efecto inexistente. Este corte preserva ese contrato de backend y usa «Publicar cambios», con texto previo que explica que la portada pública se actualiza. No agrega persistencia de borradores ni controles de banner/categoría sin un campo productivo.

## Implementación

- Editor Real de título y cuerpo con snapshot confirmado por el servidor y vista previa local del hero, usando los estilos de la portada pública. La vista previa muestra el texto como texto escapado y no ejecuta HTML.
- `HomeContentPhase` es un tipo cerrado: Loading, Clean, Editing, Invalid, Saving, Success, Error, AccessDenied y Unknown. La etiqueta y la condición busy viven en el tipo; `fromWire` falla a Unknown.
- `UserContentStore` concentra carga, edición, descarte y publicación. El snapshot publicado cambia únicamente al recibir una respuesta confirmada. Un error conserva la edición y permite reintento explícito; no se reintenta automáticamente una escritura.
- La publicación requiere título y cambios pendientes. Durante una solicitud se bloquean edición, descarte, nuevas publicaciones y navegación para no abandonar un resultado todavía desconocido.
- «Descartar cambios» requiere confirmación y restaura el último snapshot confirmado. Salir con cambios abre confirmación nativa; cancelar conserva el texto. La ruta registra `canDeactivate` y el cierre/recarga del navegador usa `beforeunload`.
- El texto editado permanece en memoria del componente; este corte no promete recuperación después de cerrar el navegador ni resolución de conflictos entre dos administradores.
- Cambio de principal/roles o cierre de sesión elimina el snapshot privado, cancela solicitudes anteriores y permite completar logout sin bloquearlo con una confirmación de edición de una sesión ya cerrada.

## Aceptación y evidencia focal

Las pruebas cubren carga, validación, restauración, publicación en curso, respuesta normalizada del servidor, error con conservación y reintento, cancelación/aceptación de salida, `beforeunload`, preview escapado, controles bloqueados, logout y rechazo de respuestas tardías. Comando focal: `npm run test -- --include='src/app/features/admin/user-content*.spec.ts' --include='src/app/domain/user/home-content-phase.spec.ts'`: **11/11 PASS**. Arquitectura **7/7 PASS**, lint **PASS**, build Real **PASS**. Gate browser focal `STORECORE_A11Y_PORT=4393 npx playwright test e2e/admin-content.spec.ts --workers=1`: **2/2 PASS** en 320/1440, con edición, preview, cancelación de salida, descarte, fallo/reintento/publicación, navegación confirmada, reflow y axe sin serious/critical. Puerto 4393 libre al terminar. Esta evidencia focal no sustituye homologación ni aceptación contra backend vivo. El gate global registra el SHA final y las revisiones del mismo corte.
