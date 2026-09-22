# Spec UI — identidad (TASK-004)

## CUSTOMER `/customer`

- Registro: `POST /api/v1/customer/auth/register` con `{ email, password, firstName, lastName }`; login: `POST /api/v1/customer/auth/login`.
- Las respuestas sólo establecen cookie HttpOnly `__Host-storecore-customer` y entregan el CSRF por `X-CSRF-Token`; nunca exponen una sesión en `data`.
- Perfil: `GET/PUT /api/v1/customer/me`. Direcciones: `GET/POST /api/v1/customer/me/addresses`, `PUT/DELETE /api/v1/customer/me/addresses/{addressId}` con `{ street, number, city, province, postalCode, isDefault }`.
- `CustomerStore` → use cases → `CustomerHttpRepository`; presenter no llama HTTP. Todas las requests usan `credentials: include`; los writes llevan el CSRF sólo en memoria.
- Sign-out es `POST /api/v1/customer/auth/logout` con CSRF. Un 401 limpia estado local; un 403 `CSRF_INVALID` obtiene token fresco mediante `GET /api/v1/customer/auth/csrf`, sin reintentar automáticamente un write.

## USER `/internal`

- Sesión distinta: `POST /api/v1/internal/auth/login`, cookie `__Host-storecore-internal`; no hay registro HTTP de USER.
- Guard separado consulta `GET /api/v1/internal/me`; CUSTOMER nunca entra a `/internal/*` y USER no adquiere recursos CUSTOMER.
- Sólo ADMIN puede revocar una sesión con `POST /api/v1/internal/admin/sessions/{sessionId}/revoke` y `{ reason, correlationId }`; el UI nunca recibe token, hash, password ni CSRF persistido.

## AC

- AC-3: customer edita sólo su perfil/direcciones.
- USER y CUSTOMER no comparten store, cookie ni header de sesión.
- El CSRF en memoria se rota tras writes exitosos y nunca se persiste en storage/URL/logs.