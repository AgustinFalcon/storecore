# Frontend architecture — StoreCore

StoreCore Angular 22:

`Container (ruta) → View (HTML) → Store (ComponentStore) → UseCase → IRepository → HTTP`

| Capa | Qué hace | Qué no hace |
|---|---|---|
| View `*.view.html` | Markup y `@Input` / `@Output` | Store, HTTP, Router |
| Container `*.component.ts` | Carga y mapea eventos al store | Markup de pantalla |
| Store | Estado y effects | Template |
| UseCase / port | Dominio UI | Angular UI |
| HTTP repository | Adapter HTTP | Estado |

CUSTOMER y USER son realms de sesión de servidor separados. El browser no conserva token de sesión, Bearer, JWT ni refresh token: cada petición usa `credentials: include`; el backend selecciona su cookie `__Host-` por ruta. `authInterceptor` sólo adjunta el CSRF en memoria a writes autenticados y actualiza dicho valor desde `X-CSRF-Token`; guard y bootstrapping consultan `/api/v1/customer/me` o `/api/v1/internal/me`. Login/register consumen cookies HttpOnly y CSRF por header, no por JSON. El frontend nunca registra esos headers ni los guarda en local/session storage.

Production `app.config.ts` enlaza sólo repositorios HTTP. No hay catálogo in-memory ni banner DEMO.

Inventario de pantallas: `docs/agent/frontend/screens.md`.