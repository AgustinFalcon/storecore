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

## Revisión independiente GPT-6.1 Sol y segundo cierre

Al no estar disponible Astra, GPT-6.1 Sol realizó una revisión independiente read-only del commit `301c8b3` y emitió `REQUEST_CHANGES` sin P0/P1. Reprodujo cuatro P2 y un P3: feedback de carrito fuera del punto de acción en PDP móvil, producto no identificable dentro del primer viewport, filtros móviles abiertos por defecto, ficha sin especificaciones concretas y salto semántico `h1` → `h3` en tarjetas.

El segundo corte corrige esos hallazgos sin ampliar integraciones:

- feedback local de éxito/error asociado a Cantidad, con estado cerrado, `aria-invalid`, `aria-describedby` y foco de error;
- carrusel comercial horizontal y hero compacto: nombre y precio completos dentro del viewport en 390/768/1440;
- catálogo móvil con filtros secundarios cerrados por defecto y tarjetas identificables antes del scroll;
- especificaciones Demo concretas por producto, con traductor y fallback sin mutar snapshots históricos;
- títulos de producto `h2`, eliminando el salto semántico detectado por Axe;
- PDP móvil prioriza identidad, precio y compra antes de la galería simulada.

Gates exact-source posteriores: arquitectura 7/7, lint, 134 archivos / 988 tests unitarios, build productivo y 335/335 recorridos Demo en 17,6 minutos. Los tests responsive ya no aceptan un borde de tarjeta: exigen nombre y precio completos dentro del viewport y producto identificable en catálogo móvil. El veredicto final independiente se registra únicamente después de revisar este nuevo commit.

La segunda revisión Sol confirmó los cinco cierres pero encontró una nueva superposición P2 entre Favorito y el nombre de la segunda tarjeta a 768 px. El control se reubicó sobre la imagen y la aceptación mide geométricamente cero intersección favorito–título en 390/768/1440. Durante la repetición de gates aparecieron dos unit tests sensibles a storage heredado entre archivos; se agregó limpieza previa explícita y se obtuvieron dos ejecuciones consecutivas de 988/988, seguidas de `npm run verify` completo y una nueva suite Demo **335/335 en 16,0 minutos**. No se reclama aprobación independiente hasta el siguiente veredicto Sol sobre este corte.

## Veredicto independiente final

GPT-6.1 Sol revalidó read-only el commit de código `60d550083136971c13ac516189b5cb9a967f6c35` y emitió **APPROVE**, sin findings P0–P3 dentro del alcance frontend Demo. Reprodujo cero intersección favorito–título en todas las tarjetas a 390/768/1440, comprobó que el gate geométrico detecta la posición anterior defectuosa, confirmó los cinco hallazgos originales cerrados y obtuvo 12/12 verificaciones Axe sin violaciones, sin overflow ni errores JavaScript. Esta aprobación no acredita backend, proveedores reales ni homologación.

## Límites

Este cierre acredita diseño frontend y comportamiento Demo local de Fase 1. No acredita backend completo, CI remoto, PR/merge, deploy, Mercado Pago, ARCA, Correo Argentino ni Mercado Libre live. Las representaciones de esos proveedores siguen explícitamente simuladas y sin secretos.

