# Spec UI — shell y tokens (TASK-001)

- Layout con skip-link, header, nav, main `#contenido-principal`.
- Estados globales: loading, error+retry, empty.
- Chrome de sesión: Customer/User con o sin sesión. Identidades no se mezclan.
- Tokens en `:root`: ink, surface, canvas, focus, spacing. Sin color de marca.
- `prefers-reduced-motion: reduce`.
- Sin `store_id` en rutas ni en environment.
- Health: `GET /api/v1/health` vía `ShellStore` → `GetHealthUseCase` → HTTP.

## AC

- AC-1/AC-2: domain sin Angular; production repository HTTP.
