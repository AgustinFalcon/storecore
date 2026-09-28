# Functional Spec — `storecore-frontend-ux-system-v1`

**Status:** `ready_for_sol_review` · **Fecha:** 2026-09-23 · **Sin código**

## Problema

Las views Angular DS-00…U-10 existen en master, pero el sistema visual no estaba cerrado: Stitch viejo era piel ML/ferretería; el handoff “cerrado” no era un SDD-kit de UX; Company Brain no es este repo.

## Objetivo

Documentar y diseñar (Stitch) el sistema visual y **todas** las superficies del core: tokens, primitivas, dialogos, errores, formatos, tipografía, y las 22 rutas. Implementación Angular: otro GO. BlackStore: otro repo/tramo.

## Inventario (obligatorio)

Ver `docs/agent/frontend/screens.md` + `1-functional/product-decision-home-carousels.md`.

| ID | Superficie | Nota |
|---|---|---|
| DS-00 | Primitivas + chrome | Skip, header navy, banner API, subnavs, botones, campos, cards, badges, tabla, price stack, qty |
| DS-04 | Dialogos | Confirm, destructivo, error API, merge incompatible |
| DS-05 | Feedback | Loading, error+Reintentar, vacío, disabled, éxito |
| DS-06 | Tipo y formatos | Inter, money tabular, SKU mono, 5 estados de capability |
| P-01 | Home | **Lleno:** banner carousel + tira ofertas. **Vacío:** home configurable sin fixtures |
| P-02 | Catálogo | Toolbar + grilla; sólo effective |
| P-03 | PDP | Price stack; add con sesión customer |
| C-01…C-09 | Customer | Sesión, alta, perfil, direcciones, carrito, checkout sin MP en browser, resultado, órdenes |
| U-01…U-10 | User | Ops densa: contenido, catálogo, promos MANUAL, fulfillment, inventario RO, ML sin secretos, capabilities 5 estados, import perfil |

## No alcance

POS/BlackStore UI, fiscal, favoritos, loyalty, carriers reales, calendario, automatización ML, kits, DEMO, tenancy, deploy.

## AC

- AC-UX-1: tokens DS-00 en todas las piezas; acento `#1d4ed8` sólo CTA/link/focus; header `#0f172a`.
- AC-UX-2: CUSTOMER vs USER se distinguen por densidad, no por otra paleta.
- AC-UX-3: P-01 lleno tiene banner auto-rotate (pause hover/focus/reduced-motion) y carrusel ofertas; ambos por HTTP.
- AC-UX-4: storefront muestra sólo effective; original tachado sólo con dto.
- AC-UX-5: el checkout elige Mercado Pago o efectivo en el local, sin cargar tarjeta ni cobrar; ML sin secretos ni skin amarilla; capabilities = 5 botones.
- AC-UX-6: cada pantalla documenta default / loading / vacío / error / disabled / éxito.
