# Spec UI — identidad (TASK-004)

## Entrada única (unified access)

`/login` usa el repository de acceso unificado: `POST /api/v1/auth/login`, seguido de `POST /api/v1/auth/context-selection` sólo si el backend emite un challenge. No pide elegir realm antes de verificar credenciales. CUSTOMER vuelve a `/`; USER con roles conocidos a `/user/home`. Dos sesiones existentes verificadas se seleccionan localmente, sin challenge. El coordinador publica principal, roles y CSRF juntos por realm y preserva el otro realm ante login o logout aislado. Valores wire desconocidos se traducen a `Unknown` y no conceden acceso.

`/customer/session` y `/user/session` conservan redirects compatibles a `/login` con destino cerrado validado. UA-007 completó inventario y E2E real; como encontró consumidores ejecutables, los endpoints HTTP legacy siguen soportados y no deprecados. Un retiro futuro requiere el gate separado `TODO-043`. BlackStore autentica a su personal de forma independiente, sin federación StoreCore. Prevalece el [addendum frontend archivado](../../../../sdd/features/20261003-unified-access-entry/2-technical/frontend-coordination-addendum.md).

## CUSTOMER `/customer`

- Registro: `POST /api/v1/customer/auth/register` con `{ email, password, firstName, lastName }`; compatibilidad HTTP legacy de login: `POST /api/v1/customer/auth/login` (soportada, no deprecada). La UI de login usa el acceso unificado.
- Las respuestas sólo establecen cookie HttpOnly `__Host-storecore-customer` y entregan el CSRF por `X-CSRF-Token`; nunca exponen una sesión en `data`.
- Perfil: `GET/PUT /api/v1/customer/me`. Direcciones: `GET/POST /api/v1/customer/me/addresses`, `PUT/DELETE /api/v1/customer/me/addresses/{addressId}` con `{ street, number, city, province, postalCode, isDefault }`.
- `CustomerStore` → use cases → `CustomerHttpRepository`; presenter no llama HTTP. Todas las requests usan `credentials: include`; los writes llevan el CSRF sólo en memoria.
- Sign-out es `POST /api/v1/customer/auth/logout` con CSRF. Un 401 limpia estado local; un 403 `CSRF_INVALID` obtiene token fresco mediante `GET /api/v1/customer/auth/csrf`, sin reintentar automáticamente un write.

## USER `/internal`

- Sesión distinta con cookie `__Host-storecore-internal`; `POST /api/v1/internal/auth/login` conserva compatibilidad HTTP legacy soportada, no deprecada. La UI de login usa el acceso unificado; no hay registro HTTP de USER.
- Guard separado consume el estado aceptado del coordinador, que verifica `GET /api/v1/internal/me` junto con el CSRF USER. CUSTOMER nunca entra a `/internal/*` y USER no adquiere recursos CUSTOMER.
- Sólo ADMIN puede revocar una sesión con `POST /api/v1/internal/admin/sessions/{sessionId}/revoke` y `{ reason, correlationId }`; el UI nunca recibe token, hash, password ni CSRF persistido.

## AC

- AC-3: customer edita sólo su perfil/direcciones.
- USER y CUSTOMER no comparten store, cookie ni header de sesión.
- El CSRF en memoria se rota tras writes exitosos y nunca se persiste en storage/URL/logs.
