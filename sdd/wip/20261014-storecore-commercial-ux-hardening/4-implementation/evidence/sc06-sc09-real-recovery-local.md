# SC06–SC09 Real — recuperación de formularios

Fecha: 2026-10-15. Corte local provisional, sin cierre de gates visuales.

## Cambios

- Registro, perfil y direcciones usan `CustomerFormPhase` y `CustomerNotice` cerrados con `Unknown`. La carga y las mutaciones bloquean edición y solicitudes duplicadas; las fallas de guardado conservan los borradores.
- Un fallo de carga ofrece reintentar carga. Un fallo de guardado mantiene el formulario para reintentar la operación; no recarga automáticamente el perfil encima del borrador.
- Registro conserva `returnTo` exclusivamente a través de la política existente `ReturnDestination` y del contexto CUSTOMER. Login → registro → login conserva esa intención; un retorno externo o de USER se descarta. El perfil ofrece continuación explícita cuando recibe una intención permitida. No se amplía la allowlist ni se implementan retornos dinámicos de producto/variante.
- Borrar dirección requiere un diálogo nativo con cancelar, Escape, encierro/restauración de foco y validación del actor/propuesta al confirmar. No se despacha en la propuesta ni en la cancelación. Se preserva un borrador de otra dirección al eliminar.
- Favoritos declara expresamente alcance de pestaña y ausencia de sincronización de cuenta. `FavoritesPersistence` informa almacenamiento de sesión, fallback en memoria o fallo. Una escritura fallida conserva la lista previa y permite reintentar; la salida al catálogo permanece disponible en vacío.

## Evidencia local

`npm test -- --include=src/app/domain/customer/customer-form-phase.spec.ts --include=src/app/features/identity/customer-recovery.spec.ts --include=src/app/features/identity/customer.store.spec.ts --include=src/app/core/favorites/favorites-browser.store.spec.ts`: **18/18 PASS**, cuatro suites.

Cubren traductores/Unknown, edición y comandos concurrentes, conservación de borradores tras fallos, respuestas tardías de otro actor, registro con retorno CUSTOMER/externo/USER, confirmación/cancelación e invalidación de propuesta, y escritura fallida de favoritos con reintento.

`npm run lint`: **PASS**.

`npm run build`: **PASS**, compilación productiva Angular de contenedores y templates.

## Residuales explícitos

No hay nueva validación E2E/axe/capturas responsive del corte SC06–SC09; las pruebas de foco/trap en navegador y el gate visual siguen pendientes. El almacenamiento corrupto de favoritos conserva el decoder previo, que descarta entradas inválidas; no se agrega una migración de persistencia. El fallback en memoria sigue siendo una excepción local declarada. El registro conserva el contrato de autenticación existente y sus cercos por generación; no se amplían puertos ni backend. No se agrega cambio de contraseña ni wishlist persistente de cuenta. Demo no se modifica. Sin commit, deploy, homologación ni cierre del feature.
