# Contrato HTTP que consume el frontend StoreCore

El browser habla sólo con `/api/v1/**` mediante el proxy local de desarrollo o el mismo origin de la instalación. No existe `store_id`, fixture, secreto ni cliente BlackStore en el browser. Todas las respuestas con cuerpo usan el envelope AssistTime `BaseResponse`:

```json
{ "code": 200, "data": {}, "message": null, "errorCode": null, "retryable": null, "traceId": null }
```

Un error conserva el status HTTP en `code`, `data: null`, `errorCode` estable y `traceId`; credenciales inválidas, inactivas, inexistentes o de realm incorrecto devuelven el mismo `401 AUTHENTICATION_FAILED` sin enumerar sujetos. La única respuesta sin cuerpo es `204` de logout.

## Público storefront (futuras tareas)

| Método | Ruta | Auth | Respuesta `data` |
|---|---|---|---|
| GET | `/api/v1/health` | no | `{ status }` |
| GET | `/api/v1/catalog?query&brand&category&offers=true` | no | `ProductSummary[]` |
| GET | `/api/v1/catalog/products/{sku}` | no | `ProductDetail` |
| GET | `/api/v1/catalog/brands` | no | `{ id, name }[]` |
| GET | `/api/v1/catalog/categories` | no | `{ id, name }[]` |
| GET | `/api/v1/content/home` | no | `{ title, blocks }` |

## Acceso unificado (UA-005–UA-007 cerrados)

`/login` es la única entrada visual. Usa `POST /api/v1/auth/login` con `{ email, password, returnPath? }` y, sólo ante un challenge verificado, `POST /api/v1/auth/context-selection` con `{ challenge, context }`. Ambos validan el Origin exacto configurado y no se reintentan automáticamente. El contrato de respuestas, destinos cerrados y errores está en [OpenAPI unified access](../../../sdd/features/20261003-unified-access-entry/2-technical/api/unified-access.openapi.yaml).

El mapper traduce a tipos cerrados antes de efectos. Sólo un resultado autenticado instala principal y CSRF en su realm; un challenge no crea sesión ni instala CSRF. Con dos sesiones existentes verificadas, la elección es local y no consume un challenge. Cookies, roles y logout siguen separados. BlackStore tiene identidad propia: este flujo no federa ni emite acceso BlackStore.

`/customer/session` y `/user/session` son redirects compatibles a `/login`, conservando sólo un destino cerrado validado. Los dos POST de login realm-specific listados abajo siguen soportados y no están deprecados. UA-007 completó inventario y E2E real: el inventario encontró consumidores ejecutables y decidió retener compatibilidad. Cualquier retiro futuro pertenece a `TODO-043`. Ver [addendum frontend](../../../sdd/features/20261003-unified-access-entry/2-technical/frontend-coordination-addendum.md).

## Sesiones CUSTOMER (TASK-004)

El cliente usa `fetch`/`HttpClient` con `credentials: 'include'`. No hay `Authorization`, Bearer, JWT, refresh token ni token de sesión en JSON, storage, URL, telemetry o logs. El backend elige exclusivamente la cookie `__Host-storecore-customer`; recibir la cookie interna o un realm equivocado es `401` genérico.

| Método | Ruta | CSRF | Body/resultado |
|---|---|---|---|
| POST | `/api/v1/customer/auth/register` | no | `{ email, password, firstName, lastName }` → `201`, `Set-Cookie`, `X-CSRF-Token`, `data: { id, email, firstName, lastName }` |
| POST | `/api/v1/customer/auth/login` | no | Compatibilidad legacy soportada, no deprecada: `{ email, password }` → `200`, `Set-Cookie`, `Cache-Control: no-store`, `X-CSRF-Token`, perfil mínimo |
| POST | `/api/v1/customer/auth/logout` | sí | `204`, revoca una vez y expira la misma cookie (`Path=/`) |
| GET | `/api/v1/customer/auth/csrf` | cookie | `200`, `Cache-Control: no-store`, header `X-CSRF-Token`; no rota |
| GET/PUT | `/api/v1/customer/me` | PUT sí | PUT `{ email, firstName, lastName, phone }`; perfil propio |
| GET/POST | `/api/v1/customer/me/addresses` | POST sí | address list / `{ street, number, city, province, postalCode, isDefault }` |
| PUT/DELETE | `/api/v1/customer/me/addresses/{addressId}` | sí | misma dirección / `204` |

La dirección siempre pertenece al principal CUSTOMER: no existe `customerId` en URL, body o header. Una dirección ajena devuelve `404`; `isDefault=true` reemplaza la anterior dentro de una transacción serializada por customer, y el índice parcial garantiza como máximo una default. Todos los writes autenticados —incluido logout— llevan `X-CSRF-Token`; el token vigente sólo vive en memoria y cada write exitoso devuelve el siguiente por ese header. Ante `403 CSRF_INVALID`, el cliente descarta el token y hace un único `GET .../auth/csrf` antes de ofrecer reintento explícito; nunca repite automáticamente un write de negocio.

## Sesiones USER internas (TASK-004)

La sesión interna usa sólo `__Host-storecore-internal`, nunca se comparte con CUSTOMER. No existe registro HTTP de USER: el primer ADMIN se crea sólo por `bootstrap-admin` local. Un CUSTOMER no entra a estas rutas y un USER no adquiere ownership de recursos CUSTOMER.

| Método | Ruta | CSRF | Body/resultado |
|---|---|---|---|
| POST | `/api/v1/internal/auth/login` | no | Compatibilidad legacy soportada, no deprecada: `{ email, password }` → `200`, `Set-Cookie`, `Cache-Control: no-store`, `X-CSRF-Token`, perfil/roles actuales |
| POST | `/api/v1/internal/auth/logout` | sí | `204`, revoca una vez y expira la misma cookie |
| GET | `/api/v1/internal/auth/csrf` | cookie | `200`, `Cache-Control: no-store`, `X-CSRF-Token`; no rota |
| GET | `/api/v1/internal/me` | no | `{ id, email, firstName, lastName, roles }` |
| POST | `/api/v1/internal/admin/sessions/{sessionId}/revoke` | sí + ADMIN | `{ reason, correlationId }` → `200` resultado redacted |

Las rutas administrativas/comerciales posteriores conservan esta cookie, `credentials: 'include'` y CSRF para cada mutación; no introducen Bearer. Falta de cookie, sesión vencida/revocada, sujeto inactivo, realm contrario o rol removido devuelve `401` genérico; falta de ADMIN devuelve `403`.

## Reglas de transporte de identidad

Cookies: `Secure; HttpOnly; SameSite=Lax; Path=/`, sin `Domain`; login/register nunca devuelven el valor de sesión y logout borra exactamente nombre/path. La instalación opera same-origin; el proxy local preserva credenciales. Si se habilita CORS excepcionalmente, sólo permite el origin exacto configurado de esa instalación, `credentials=true`, `X-CSRF-Token` como request header y `X-CSRF-Token` como exposed response header: jamás `*`. Toda mutación valida `Origin` además de CSRF. El interceptor sólo agrega el CSRF en memoria a mutaciones autenticadas; guard y repositorios preguntan `/internal/me` o `/customer/me`, no decodifican ni almacenan tokens.

## Fuera de alcance del UI

BlackStore `/blackstore-integration/v1`, fiscal, Mercado Pago en el browser, `store_id`, secretos y Universal Tools hardcodeado.
