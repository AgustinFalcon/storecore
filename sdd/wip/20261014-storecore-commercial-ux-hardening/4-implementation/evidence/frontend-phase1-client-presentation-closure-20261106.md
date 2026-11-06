# StoreCore Fase 1 — cierre local de presentación al cliente

Fecha: 2026-11-06.

## Corte

Se revalidó el alcance comercial de Fase 1 contra las 26 superficies del manifiesto. No se encontró una ruta base faltante. El hueco visual confirmado fue la selección estática de productos en Home, que no cumplía el carrusel solicitado para la presentación.

El addendum funcional y la matriz están en `4-implementation/design/phase1-client-presentation-closure-20261106.md`.

## Implementación

- Carrusel de destacados de dos productos por página y cantidad total configurable con `homepageItems`.
- Controles anterior/siguiente con límites, nombres accesibles y estado anunciado.
- Integración de ambos controles en el inventario ejecutable de CTA.
- Adaptación de las aceptaciones que antes confundían cantidad configurada con cantidad simultáneamente visible.
- Corrección de la transición para conservar contraste AA durante toda la animación.
- Datos existentes de `demoSeed()` preservados como fuente reproducible; no se agregó fixture al frontend productivo.

## Gates locales finales

- `npm run verify`: PASS.
  - arquitectura: 7/7;
  - lint: PASS;
  - unit/component: 134 archivos, 988 tests;
  - build productivo: PASS.
- build `demo-test`: PASS.
- escenario focal del carrusel: 1/1, incluido Axe.
- CTA matrix completa: 28/28 en 3,8 minutos; ninguna CTA visible o estática sin escenario.
- suite Demo integral: 335/335 en 16,7 minutos.
- responsive ejercido en 320, 390, 768, 900 y 1440 según la superficie; Home comercial verificada en 390/768/1440.
- ningún request a backend o proveedor externo permitido por la suite Demo.

## Revisión visual independiente y remediación

Una auditoría independiente GPT-6 Astra alcanzó a reproducir tres P2 antes de agotar su cuota: el texto del botón Buscar podía quebrarse; los productos aparecían demasiado tarde en la Home, especialmente en móvil; y la categoría `Histórico` se derivaba de productos archivados.

Se corrigieron los tres puntos:

- búsqueda con ancho mínimo y `white-space: nowrap`;
- productos destacados inmediatamente después del hero y hero móvil compacto sin arte decorativo;
- marcas/categorías públicas derivadas sólo de productos activos.

La aceptación automática exige ahora primer producto dentro del viewport en 390/768/1440, ausencia de la categoría archivada y botón Buscar sin salto. Sobre el código corregido se repitieron `npm run verify` y los 335 escenarios Demo: PASS. Astra no llegó a emitir un veredicto final por límite de uso, por lo que no se reclama `APPROVE` independiente para este segundo corte.

## Límites

Este cierre acredita diseño frontend y comportamiento Demo local de Fase 1. No acredita backend completo, CI remoto, PR/merge, deploy, Mercado Pago, ARCA, Correo Argentino ni Mercado Libre live. Las representaciones de esos proveedores siguen explícitamente simuladas y sin secretos.

