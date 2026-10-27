# SC-SURF-26 — promoción Demo de administración de clientes

Base: `c1af13d7968c9d39ca6c27d99ff47925b046c5ba`. Fecha: 2026-10-27.
Estado: implementación local provisional; sin commit, push, PR, merge ni publicación.

## Runtime propietario y límites

`main.demo.ts` registra exclusivamente `/demo/user/customers` mediante
`DemoScreen.Customers` y `DemoCustomersComponent`. No agrega `/user/customers`,
HTTP, adapters productivos ni permisos globales. La entrada Real conserva su grafo.
La ficha enlaza el pedido real de este runtime local `/demo/user/orders/ORD-1015`.
ADMIN consulta y ejecuta comandos; OPERATOR consulta y abre pedidos, sin CTA ni
handlers de pago, entrega, incidencia o devolución habilitados; Customer y Unknown
no reciben filas/ficha. La autoridad usa `UserRole` cerrado existente.

La seed existente se conserva y recibe sólo el slice correlacionado customer-2209 /
ADDR-2209 / ORD-1015 / LUM-042/standard. Rocío Gil, rocio@demo.invalid,
+54 11 0000 2209; Dirección ficticia, Av. Demo 2209, CABA. No se informa CP ni
domicilio primario. Pedido del 2026-10-14, domicilio, 2 × $84.500 = $169.000,
pago aprobado, entregado, SC-1015; no hay fecha de entrega, identidad verificada,
medio de pago, transportista o fiscalidad inferidos. Las cantidades monetarias
se guardan como enteros de centavos. No se promueve el ledger SC20–25 completo.

## Autorización, persistencia y concurrencia

Snapshot comercial v2, misma clave durable `storecore.commercial-demo.v1` para
migrar v1 en la única frontera `decodeSnapshot`. V1 sin autoridad migra a Active,
generación 0; v2 sin autoridad válida resulta Unknown y deniega acceso. La migración
agrega el slice sólo si no existen sus IDs y rechaza colisiones parciales/ownership
incorrecto. Conserva los pedidos anteriores. JSON corrupto nunca autoriza desde seed.

`CustomerAccountState`, filtro y comando son tipos cerrados; la política pura y la
consulta están separadas de Angular. Restrict exige motivo y confirmación, cambia
estado e incrementa generación en una sola transacción comercial. Repetir un comando
ya aplicado no incrementa revisión/generación ni vuelve a escribir. Cancelar no
ejecuta comando. Error previo al commit conserva snapshot válido y motivo del diálogo;
conflicto exige recarga. No se presenta localStorage como CAS: Web Locks ya existente
conserva una única pestaña escritora, las demás consultan y bloquean CTA de mutación.

La sesión Customer guarda la generación observada y la valida contra persistencia
al rehidratar, ingresar y ejecutar una transacción. Checkout diferido vuelve a
comprobar contexto, actor/generación y persistencia antes de crear el pedido.
`storage` revoca sólo la sesión Customer afectada; otra cuenta y sesión interna no
se revocan. Reactivar vuelve a incrementar generación y exige nuevo login: una
sesión anterior no reaparece. Cambio de actor/logout invalida callbacks y
confirmaciones. Reset explícito también avanza las generaciones de acceso.
Perfil, direcciones, carrito, pedidos, devoluciones y reembolsos se preservan;
la restricción no opera sobre los agregados de pedidos.

## Interfaz y estados

Lista/cards, búsqueda normalizada por nombre/email/ID, filtro cerrado, limpiar filtros,
empty/no-results, Unknown fijo, error de lectura diferenciado de permisos y recuperación.
Ficha y confirmación usan native dialog, nombre accesible, Escape, trap Tab explícito,
restauración de foco; éxito contextual por cliente con foco estable tras cambiar CTA.
La navegación administrativa usa drawer móvil separado del menú público, con
aria-expanded/controls y foco restaurado. La escritura síncrona no simula fases de
loading/saving inexistentes; reintentar conserva motivo tras fallo. Customer-not-found
ofrece retorno a la lista si la selección deja de existir.

## Verificación ejecutada

- Instalación reproducible `npm ci --ignore-scripts --prefer-offline --no-audit --no-fund`: PASS.
- Reproducción independiente final `npm run verify` (2026-10-27 19:44 UTC):
  arquitectura **6/6 + scan PASS**, lint PASS, **70 archivos / 421 tests PASS** y
  build Real PASS (597.21 kB raw / 132.78 kB transfer estimado).
- `npm run build:demo`: PASS; la reproducción independiente compiló el build
  Demo final 2026-10-27 19:44:28 UTC, total 2.15 MB raw.
- Las compilaciones Angular requieren ejecución permitida fuera del sandbox por
  lectura de ancestros para resolver estilos; no implican publicación.
- Browser SC26 sobre build final: **11/11 PASS**, inicio 2026-10-27T19:42:33.751Z,
  duración 22.7 s, 0 skipped/unexpected/flaky. `node node_modules/@playwright/test/cli.js
  test --config demo-e2e/playwright.sc26.config.ts`.
- Axe: 20 escenas adjuntas al reporte; **0 violaciones totales** verificadas al
  decodificar sus attachments (además de la aserción serious/critical del runner).
  Lista/ficha/restricción/reactivación 320/390/768/1440, drawer y errores de
  lectura/escritura sin overflow/clipping observado. Teclado, Escape, foco tras
  confirmar y restauración de foco PASS; ninguna API Real alcanzada.
- Capturas: 19 PNG y `results.json` en `frontend/demo-e2e/artifacts/sc26/`
  (artefactos locales ignorados por Git; los escenarios/configuración sí son fuente).
- Reproducción independiente final `npm run test:demo`: **44/44 PASS** (2.4 min)
  sobre el build Demo 19:44:28 que incluye el guard de login ante desaparición de
  persistencia. Cubre SC26, catálogo, matriz CTA, compra/stock/fulfillment,
  configuración y concurrencia Web Locks. El primer intento 39/43 encontró expectativas
  antiguas de conteos: catálogo 12→13 productos, 24→25 rutas y 11→12 disponibles.
  Se corrigieron las expectativas derivándolas del fixture/tipo de rutas y se
  agregó propiedad explícita de nuevas CTA a la matriz, sin cambiar el catálogo.
- UX/Product reviewer independiente Astra: FINAL APPROVE sobre build 19:31:53,
  seis capturas renovadas y fuente; 0 P0/P1/P2 propios. Posteriormente browser
  encontró contraste de error de lectura, corregido y revalidado arriba.

Tests propios: `customers/customer-account.spec.ts` y `customer-session.spec.ts`;
tipos/decoder/migración/matriz roles/join por ID, motivo, repetición, preservación,
fallo precommit, conflicto, reload, cuenta distinta, sesión revocada, reactivación,
nuevo login, segunda pestaña, autorización en checkout pendiente y corrupción.

No se reutilizan los 631 tests ni el journal epoch de la evidencia histórica
20261019. Stitch, triple gate visual global, revisión de SHA final y CI remoto
siguen separados. El corte no declara backend, proveedores reales ni homologación.
