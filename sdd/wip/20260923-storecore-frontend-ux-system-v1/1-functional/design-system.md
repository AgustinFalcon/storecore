# Design system — StoreCore OS

Fuente de tokens en código: `frontend/src/styles.scss` (`--sc-*`).  
Stitch: `assets/9094855779690782792`.

## Color

| Token | Hex | Uso |
|---|---|---|
| theme | `#0f172a` | Header/chrome únicamente |
| theme-ink | `#f8fafc` | Texto sobre header |
| canvas | `#f4f4f5` | Fondo de página |
| surface | `#ffffff` | Cards, tablas, forms |
| ink | `#18181b` | Texto |
| accent | `#1d4ed8` | Primary, links, focus |
| success / warning / danger / info | `#166534` / `#a16207` / `#991b1b` / `#1e3a8a` | Badges y banners, no marca |

Light only. WCAG 2.2 AA. Focus: outline 2px accent + offset 2px.

## Tipo

Inter only. Storefront h1 1.75rem/650. Ops h1 1.375rem/650. Body 1rem/1.5. Tablas 0.875rem. Precios `tabular-nums` etiquetados **Efectivo**.

## Componentes

- Botones: primary / ghost / danger / disabled (title que explica por qué).
- Campo: label arriba, helper faint, error borde+texto danger.
- Dialogos: card max ~28rem, overlay muted, primary + cancel; destructivo = danger.
- Feedback: ver DS-05. Nunca fake data.
- Capability: cinco estados, nunca boolean.

## Prohibido como marca

Amarillo ML, cuotas inventadas, FULL, countdown, DEMO, `store_id`, tenant switcher, logo MP, favoritos, POS en este frontend.
