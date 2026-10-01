# Technical Spec — `storecore-frontend-ux-system-v1`

**Status:** `ready_for_sol_review` · **Fecha:** 2026-09-23 · **Sin implementación en este WIP**

## Architecture (ya existe; no se cambia aquí)

```text
Container (ruta) → View (HTML) → ComponentStore → UseCase → IRepository → HTTP
```

CUSTOMER y USER no comparten cookie. Browser no guarda Bearer/JWT. Production `app.config.ts` = repositorios HTTP.

## Contrato visual → código

| Capa | Dueño |
|---|---|
| Tokens `--sc-*` | `frontend/src/styles.scss` |
| Markup de pantalla | `*.view.html` listado en `screens.md` |
| Stitch HTML | referencia; volcado a view **sólo** con Sol GO de implementación |
| Home banners/ofertas | `GET /api/v1/content/home` + catálogo `offers` — no fixtures |

## Accesibilidad

- Un H1 por pantalla. Labels reales (no placeholder-only).
- `prefers-reduced-motion` detiene autoplay del banner.
- Pause carousel on hover/focus.
- Axe en pantallas públicas: `npm run test:a11y` (TASK-013 residual del core).

## Fuera

No Flyway, no Kotlin, no UI de venta física / POS companion, no secretos, no deploy.
