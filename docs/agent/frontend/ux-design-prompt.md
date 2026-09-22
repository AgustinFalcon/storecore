# Prompt maestro — diseño StoreCore (todas las pantallas)

Copiar este documento entero a la IA de diseño. Pedir **una pieza por mensaje** usando el bloque “Generar ahora” del final.

Sos un diseñador de producto senior + implementador de HTML/CSS. Tenés que diseñar el sistema visual y **todas** las pantallas de StoreCore, un comercio electrónico **single-tenant** (una instalación = un comercio = un dominio). El frontend Angular ya existe: vos no inventás pantallas nuevas. Entregás HTML+CSS que un ingeniero va a pegar en views Angular (`*.view.html`).

---

## 0. Rol, idioma, entregable

**Idioma de UI:** español rioplatense (voseo: “Elegí”, “Intentá”, “Creá”). No inglés en labels.

**Entregable por pieza:**

1. Mock desktop **1280×800** (captura o frame).
2. Mock mobile **390×844**.
3. HTML semántico (sin React, sin Vue, sin Tailwind CDN). Clases BEM `sc-*`.
4. CSS que **sólo** use las variables `:root` de abajo. Prohibido hex suelto fuera de `:root`.
5. Tabla de estados de esa pantalla: default / loading / vacío / error / disabled / éxito.

**No es un moodboard.** Es un sistema de producto listo para producción.

---

## 1. Qué es el producto (y qué no)

StoreCore es el **sistema operativo de una tienda**, no la marca del comercio. El chrome puede decir “StoreCore”. El storefront **no** usa un nombre de cliente inventado, ni logo de ferretería, ni “Universal Tools”, ni “Demo Shop”.

Hay **dos identidades que nunca se mezclan**:


| Área                  | Quién            | Densidad                   | Sensación                                 |
| --------------------- | ---------------- | -------------------------- | ----------------------------------------- |
| Storefront + Customer | Comprador        | Aireada, cards, fotos      | Editorial commerce, calma, precio claro   |
| User                  | Operador interno | Densa, tablas, formularios | Consola operativa, precisa, sin marketing |


Misma paleta. Distinto ritmo.

**Prohibido diseñar ahora:** POS/BlackStore, facturación ARCA, Mercado Pago wallet/checkout embebido, loyalty, favoritos, carriers, calendario comercial, automatización de precios ML, kits, banners DEMO, selector de tenant, `store_id`, marketplace multi-comercio, dark mode.

**Prohibido visual:**

- Color de marca de un cliente (naranja ferretería, verde supermercado, etc.).
- Logo oficial de Mercado Libre o Mercado Pago como identidad de StoreCore. ML es un **módulo** con badge de estado, no una skin amarilla.
- Countdowns falsos, “últimas 2 unidades”, dark patterns.
- Stock photos con logos de Apple/Nike/etc. Productos genéricos (caja, herramienta, textil liso).
- Inter, sí. Comic Sans / display novelty, no.

---

## 2. Design tokens (obligatorios, copiar tal cual)

```css
:root {
  color-scheme: light;
  --sc-font: Inter, system-ui, sans-serif;

  --sc-color-ink: #18181b;
  --sc-color-muted-ink: #3f3f46;
  --sc-color-faint-ink: #71717a;
  --sc-color-surface: #ffffff;
  --sc-color-canvas: #f4f4f5;
  --sc-color-muted: #ececef;
  --sc-color-line: #d4d4d8;
  --sc-color-line-strong: #a1a1aa;

  --sc-color-theme: #0f172a;
  --sc-color-theme-ink: #f8fafc;

  --sc-color-focus: #1d4ed8;
  --sc-color-focus-soft: #dbeafe;
  --sc-color-accent: #1d4ed8;
  --sc-color-accent-ink: #ffffff;

  --sc-color-success: #166534;
  --sc-color-success-soft: #dcfce7;
  --sc-color-warning: #a16207;
  --sc-color-warning-soft: #fef9c3;
  --sc-color-danger: #991b1b;
  --sc-color-danger-soft: #fee2e2;
  --sc-color-info: #1e3a8a;
  --sc-color-info-soft: #dbeafe;

  --sc-space-1: 0.25rem;
  --sc-space-2: 0.5rem;
  --sc-space-3: 0.75rem;
  --sc-space-4: 1rem;
  --sc-space-5: 1.5rem;
  --sc-space-6: 2rem;
  --sc-space-7: 2.5rem;
  --sc-space-8: 3rem;

  --sc-radius-sm: 0.375rem;
  --sc-radius: 0.5rem;
  --sc-radius-lg: 0.75rem;

  --sc-shadow-sm: 0 1px 2px rgb(24 24 27 / 0.06);
  --sc-shadow: 0 8px 24px rgb(24 24 27 / 0.06);

  --sc-text-xs: 0.75rem;
  --sc-text-sm: 0.875rem;
  --sc-text: 1rem;
  --sc-text-lg: 1.125rem;
  --sc-text-xl: 1.375rem;
  --sc-text-2xl: 1.75rem;

  --sc-max: 64rem;
  --sc-max-wide: 80rem;
}
```

**Uso del color**

- Canvas `#f4f4f5` = fondo de página.
- Surface `#ffffff` = cards, tablas, formularios.
- `--sc-color-theme` = **header/chrome**. Lo configura el comercio en onboarding/ajustes. Default navy `#0f172a`. Nunca hardcodees amarillo ML ni el color de un cliente.
- `--sc-color-theme-ink` = texto sobre el header. Si el theme es claro, usá ink oscuro.
- Ink = texto principal. Muted-ink = ledes, metadatos. Faint = placeholders, timestamps.
- Accent azul **sólo** para botón primario, links y focus. El header no es azul salvo que el cliente elija ese theme.
- Success/warning/danger **sólo** en badges y banners, nunca como color de marca.
- Contraste WCAG 2.2 AA. Focus visible: `outline: 2px solid var(--sc-color-focus); outline-offset: 2px`.
- `prefers-reduced-motion: reduce` anula animaciones.

**Tipografía**

- Storefront h1: 1.75rem / 650. h2: 1.25rem / 600.
- Ops h1: 1.375rem / 650. Tablas: 0.875rem.
- Body 1rem / 1.5. Tabular nums en precios: `font-variant-numeric: tabular-nums`.

**Grid**

- Storefront contenido: `min(64rem, 100% - 2rem)` centrado.
- Ops contenido: `min(80rem, 100% - 2rem)` centrado.
- Gutter 1.5rem. Breakpoints: 390 / 768 / 1280.
- Mobile: una columna. Desktop storefront: a veces 8+4 (detalle producto). Ops: lista + formulario 7+5 o tabla full.

**Elevación:** cards con 1px line + shadow-sm. Header sticky surface + line. Nada de glassmorphism ni gradients de moda.

---

## 3. Primitivas (diseñar una vez, reusar)

Entregar **DS-00** primero: una hoja `design-system.html` con todos estos componentes en estados idle / hover / focus / disabled / loading.

1. **Skip link** “Saltar al contenido” — visible sólo en focus.
2. **Shell header:** izquierda wordmark “StoreCore” (texto, no isotipo recargado). Centro nav: Storefront · Catálogo · Carrito · Customer · User. Derecha chips: `Customer sin sesión` / `con sesión` y lo mismo para User, en `sc-text-sm`. Nav activo: underline 2px ink. Mobile: nav wrap o menú compacto, **no** hamburger inventado con rutas nuevas.
3. **Banner de API** (arriba del main): loading gris, error danger-soft + botón Reintentar, empty muted “API UP”.
4. **Subnav Customer:** Sesión · Registro · Perfil · Direcciones · Órdenes · [Salir].
5. **Subnav User:** Sesión · Contenido · Catálogo · Promos · Fulfillment · Inventario · Mercado Libre · Capabilities · Perfil · [Salir].
6. **Botones:** `sc-btn sc-btn--primary` (accent, ink blanco), `--ghost` (line + surface), `--danger` (danger-soft + danger ink). Altura 2.5rem storefront, 2.25rem ops. Disabled opacity 0.45 + `cursor: not-allowed`.
7. **Campo:** label arriba, control 100%, radius-sm, border line, focus ring. Helper faint. Error: borde danger + texto danger.
8. **Card** `sc-card`: padding space-5, radius, surface, line.
9. **Badge** `sc-badge`: pill 999px. Variantes: neutral, ok, warn, err, info. Usar para: activo/inactivo, pago, envío, RMA, capability.
10. **Tabla ops** `sc-table`: header muted, filas con hover muted, no zebra agresivo.
11. **Product card storefront:** imagen 1:1 canvas muted, nombre, precio **effective** grande, sin tachar effective. Original tachado **sólo** si discount > 0.
12. **Price stack:** `Efectivo $12.500` dominante. Debajo, en faint: original, dto, oferta, campaña, versión. **Nunca mezclar** base / desired / observed / effective en un solo número.
13. **Qty stepper:** − valor +.
14. **Empty state:** icono geométrico simple (no ilustración de marca), título, lede, CTA opcional.
15. **Auth card:** max 28rem, centrada, un H1, un lede, form stack, link secundario.

---

## 4. Chrome compartido (DS-00) — no es una “pantalla de negocio” pero se diseña

Layout vertical:

1. Skip link
2. Header (sticky)
3. Banner API
4. Main `#contenido-principal`
5. Si la ruta es `/customer/*` → subnav customer **dentro** del main, arriba de la view
6. Si `/user/*` → subnav user
7. Storefront no tiene subnav

Estados de sesión en header siempre visibles, aunque el usuario esté en catálogo.

---

## 5. Pantallas — inventario cerrado (22 + chrome)

Datos de ejemplo: SKU `SKU-100`, nombre “Lámpara de escritorio”, marca “Casa”, categoría “Iluminación”, effective `12500`, original `14900`, dto `2400`, oferta `OF-21`, campaña `BF-MANUAL`. Orden `ord-1042`. **No uses nombres de comercios reales.**

Cada pantalla debe contemplar: loading (skeleton o banner), vacío, error con Reintentar si hay acción de red, y el estado lleno.

### P-01 Home — `/` — `storefront-home.view.html`

**Objetivo:** home configurable. Si no hay bloques, vacío honesto.

**Layout desktop:** H1 = título del home (fallback “Storefront”). Grid de bloques `article` (máx 2 col desktop, 1 mobile). Cada bloque: h2 + body párrafo. Al pie, link “Ir al catálogo” como CTA ghost.

**Vacío:** “Home configurable vacío. El contenido llega por HTTP, no por fixtures.” Sin productos inventados.

**No:** hero slider, countdown Black Friday hardcodeado, logo de cliente.

### P-02 Catálogo — `/catalog` — `catalog-page.view.html`

**Objetivo:** buscar y filtrar.

**Toolbar (card):** 

- Búsqueda texto
- Marca select (opción “Todas”)
- Categoría select (“Todas”)
- Checkbox “Sólo ofertas”
- Botón primary “Buscar”

**Resultados:** grid 2 col mobile / 3 tablet / 4 desktop de product cards. Cada card: nombre (link a `/catalog/:sku`) + **sólo precio effective**.

**Vacío:** “No hay productos activos para estos filtros.”

**No:** facets de precio slider, sort si no está en el contrato, ratings.

### P-03 Producto — `/catalog/:sku` — `product-page.view.html`

**Layout desktop 8+4:** izquierda galería (thumbs horizontales, img 480, alt = nombre). Derecha: H1 nombre, marca · categoría, price stack (effective + version), badge oferta o “sin oferta”, lista de variantes (nombre + disponible N), cantidad number min 1.

**CTA:**

- Con sesión customer: botón “Agregar al carrito” (disabled si `active === false`, badge “Inactivo”).
- Sin sesión: no fingir add. Link “Entrar para agregar al carrito” → `/customer/session`.
- Link “Ver carrito”.

**Vacío:** “Producto no disponible.”

**Precio:** mostrar effective. No mostrar base/desired/observed al comprador.

### C-01 Login customer — `/customer/session` — `customer-session.view.html`

Auth card. H1 “Sesión customer”. Lede: “Identidad de compra. No es el acceso de operadores.” Campos: Email, Contraseña. Primary “Entrar”. Link “Crear cuenta”.

**Autenticado:** mensaje “Sesión customer activa en esta instalación” + ghost “Cerrar sesión”.

Sin “login with Google”. Sin credenciales de ejemplo en el UI.

### C-02 Registro — `/customer/register` — `customer-register.view.html`

Auth card. H1 “Crear cuenta customer”. Campos: Nombre, Email, Contraseña. Primary “Registrarme”. Link “Ya tengo cuenta”.

Autenticado: “Sesión activa” + link a perfil.

### C-03 Perfil — `/customer/profile` — `customer-profile.view.html`

Card form. H1 “Perfil customer”. Campos: Nombre, Email, Teléfono. Primary “Guardar”. Éxito: el mismo form, sin toast de red social; se puede un banner success-soft “Perfil actualizado”.

### C-04 Direcciones — `/customer/addresses` — `customer-addresses.view.html`

**Lista:** cards por dirección (etiqueta, línea, ciudad, CP). Click selecciona para editar (outline focus).

**Form:** Etiqueta, Línea, Ciudad, CP. CTA “Agregar” si no hay id, “Actualizar” si hay id. Ghost “Nueva dirección” visible sólo en edición.

Vacío: “No hay direcciones para este customer.”

### C-05 Carrito — `/cart` — `cart-page.view.html`

Tabla o lista de líneas, no cards de marketing. Columnas:
SKU/nombre | qty stepper | original | dto | oferta | campaña | **effective** | subtotal visual (qty × effective)

Footer: total effective + CTA primary “Checkout”.

Vacío: “El carrito está vacío.” + link catálogo.

**Importante:** original, dto, oferta, campaña y effective conviven **etiquetados**. El número grande es effective.

### C-06 Checkout — `/checkout` — `checkout-page.view.html`

**No hay UI de Mercado Pago** (ni botón celeste MP, ni wallet, ni QR). El browser no habla con MP.

Card:

- Lede: “El pago se inicia en el servidor. Reintentar reusa la misma clave.”
- Clave de idempotencia en faint, copiable visualmente (mono), no editable.
- Select Entrega (label · línea)
- Input Moneda (ej. ARS)
- Primary “Pagar” disabled si falta dirección, moneda o el carrito está vacío
- Si hay error: botón “Reintentar” (misma clave)

Si hay receipt: “Orden {id} · pago {paymentStatus} · orden {orderStatus}”.

### C-07 Resultado — `/checkout/result/:orderId` — `checkout-result.view.html`

Pantalla de confirmación **sobria**, no confetti. H1 “Pedido iniciado”. Lede: “Orden y pago son estados independientes. Esta pantalla no confirma Mercado Pago.”

Mostrar: id, paymentStatus badge, orderStatus badge. Link “Ver detalle”.

Vacío: “Todavía no hay orden para mostrar.”

### C-08 Órdenes — `/customer/orders` — `customer-orders.view.html`

Lista de órdenes del customer (nunca ajenas). Cada item: id (link a detalle), badges orden/pago, total, mini líneas (nombre × qty · effective).

Vacío: “Este customer no tiene órdenes.”

### C-09 Detalle orden customer — `/customer/orders/:id` — `customer-order-detail.view.html`

Link volver. H1 “Orden {id}”. Badges: orden, pago, envío. Tracking o “—”. Total. Tabla de líneas snapshot (original, dto, effective). Read-only. Sin botones de cancelar si no están en el contrato.

Vacío: “Orden no disponible para este customer.”

### U-01 Login user — `/user/session` — `user-session.view.html`

Igual anatomía que C-01 pero **ops**: H1 “Sesión user”. Lede: “Operadores internos. No comparte sesión con customer.” Sin link de registro (los users no se auto-alta). Email + password + Entrar. Autenticado + Cerrar sesión.

Fondo canvas, card más “herramienta” (menos aire que customer).

### U-02 Contenido home — `/user/content` — `user-content.view.html`

Form ops: Título, Cuerpo textarea grande. Primary “Publicar”. Lede: “Esto alimenta el home público.”

### U-03 Catálogo admin — `/user/catalog` — `user-catalog.view.html`

**Una ruta, tres secciones** (tabs o H2 ancla, no tres URLs):

**A. Productos**

- Lista/tabla: SKU, nombre, activo/inactivo badge, effective
- Click carga el form
- Form: SKU, Nombre, Descripción, Marca, Categoría, Imágenes (textarea una URL por línea), Variantes `id|sku|nombre|qty`, Precio **base**, Desired, **Observed y Effective sólo lectura**, Price version, Oferta, checkbox Activo
- Primary “Guardar producto”
- Copy: “El storefront muestra effective. Base, desired y observed no se mezclan.”

**B. Marcas** — lista clickable + form id/nombre + Guardar marca  
**C. Categorías** — igual

Desktop: lista izquierda, form derecha. Mobile: form debajo.

### U-04 Promos — `/user/promos` — `user-promos.view.html`

Lede: “Writer MANUAL. El API rechaza solapes ACTIVE. Sin automatización ML.”

Tabla: SKU, vigencia, prioridad, margen, moneda, aprobador.  
Form: SKU, Moneda, Desde, Hasta, Prioridad, Margen, Aprobador, Aprobado (datetime). Primary “Crear promo”. Badge permanente `MANUAL`.

### U-05 Fulfillment cola — `/user/orders` — `fulfillment.view.html`

Lede: “Sólo la siguiente transición. Tracking informativo. RMA no repone hasta ADJUSTED. Sin carrier real.”

Tabla: id (link detalle), envío badge, tracking, rma badge.  
Por fila, **sólo el próximo** botón: Empacar / Enviar / Entregar. Input tracking visible cuando la próxima es Enviar. RMA: Recibido / Inspeccionar / Ajustar stock — uno a la vez. No mostrar las tres acciones juntas.

### U-06 Detalle fulfillment — `/user/orders/:id` — `user-order-detail.view.html`

Volver a cola. H1 “Fulfillment {id}”. Estados orden/pago/envío/rma. Tracking. Líneas. Acciones **solo siguiente** envío + RMA como U-05. Sin mapa, sin carrier picker.

### U-07 Inventario WEB — `/user/inventory` — `user-inventory.view.html`

Read-only. Lede: “Disponibilidad derivada. Esta pantalla no escribe stock.”

Tabla: SKU | disponible | reservado | safety. Números tabular. Sin botones de ajuste.

Vacío: “No hay filas de inventario.”

### U-08 Mercado Libre — `/user/mercadolibre` — `user-mercadolibre.view.html`

**Sin secretos, sin token, sin password ML, sin color brand ML como tema.**

Header de cuenta: accountRef, badge autorizada sí/no, status.  
Tabla listings: listingId / variationId → SKU (click carga form).  
Form: Listing, Variation, SKU. Primary “Mapear”.

Lede: “Sólo cuenta autorizada y mapa listing → SKU.”

### U-09 Capabilities — `/user/capabilities` — `user-capabilities.view.html`

Lede: “Estados tipados. Sin feature flags genéricos.”

Por módulo: nombre + badge estado actual + **5 botones** `DISABLED | READ_ONLY | ACTIVE | PAUSED | ERROR`. El estado actual disabled. Colores: DISABLED faint, READ_ONLY info, ACTIVE success, PAUSED warning, ERROR danger.

No inventar un toggle boolean.

### U-10 Import perfil — `/user/profile-import` — `profile-import.view.html`

Lede: “Preview y merge explícito. El manifiesto no puede traer secretos ni reescribir histórico.”

Textarea manifiesto (mono, min-height 12rem). “Previsualizar”. “Merge” disabled hasta `compatible === true`.

Preview: si compatible, version + `<pre>` diff. Si no, banner error “Incompatible {version}. Merge cerrado.”

---

## 6. Estados globales (todas las pantallas)


| Estado   | UI                                                            |
| -------- | ------------------------------------------------------------- |
| Loading  | Banner muted “Cargando…” o skeleton de la región, `aria-busy` |
| Error    | Banner danger-soft + texto del API. No stack traces           |
| Vacío    | Empty state, nunca fake data                                  |
| Disabled | Botón/control no clickeable, no “gris misterioso” sin título  |
| Focus    | Anillo azul, no quitar outline                                |


---

## 7. Accesibilidad y contenido

- Un H1 por pantalla, `aria-labelledby` en el `<section>`.
- Labels asociados a controles (no placeholder como único label).
- Contraste AA. Precios no sólo por color (también etiqueta “Efectivo”).
- Imágenes con alt. Iconos decorativos `aria-hidden`.
- Teclado: tab order header → subnav → main.
- No `autofocus` agresivo.

---

## 8. Qué devolver (formato de archivos)

Nombrar así:

```
DS-00-design-system.html
P-01-home.html
P-02-catalog.html
P-03-product.html
C-01-customer-session.html
C-02-customer-register.html
C-03-customer-profile.html
C-04-customer-addresses.html
C-05-cart.html
C-06-checkout.html
C-07-checkout-result.html
C-08-customer-orders.html
C-09-customer-order-detail.html
U-01-user-session.html
U-02-user-content.html
U-03-user-catalog.html
U-04-user-promos.html
U-05-fulfillment.html
U-06-user-order-detail.html
U-07-inventory.html
U-08-mercadolibre.html
U-09-capabilities.html
U-10-profile-import.html
```

Un CSS compartido `storecore-ds.css` con `:root` + primitivas. Cada HTML lo linkea. Los HTML de pantalla **no** incluyen el header de Angular (el ingeniero ya tiene shell). Entregar el **contenido de** `<main>` más, aparte, el frame DS-00 del chrome.

Placeholders Angular que el HTML debe respetar (dejar comentarios HTML):
`<!-- ng: @if loading -->` `<!-- ng: @for product -->` etc., o usar listas reales de ejemplo que se puedan reemplazar.

---

## 9. Criterio de aceptación del diseño

- 22 pantallas + DS-00, desktop y mobile.
- Customer y User se distinguen por densidad, no por otra paleta.
- Precio effective es el único precio “de venta” en storefront.
- Checkout sin Mercado Pago en el browser.
- ML sin secretos ni skin de marca ML.
- Capabilities con 5 estados, no un switch.
- Cero tenant switcher / store_id / DEMO banner.
- Tokens respetados al 100%.

---

## Generar ahora (usar de a una pieza)

Pegá el maestro + **una** de estas líneas:

1. `Generá AHORA sólo DS-00: hoja de primitivas + chrome (header, banner API, subnav customer, subnav user) en 1280 y 390. HTML+CSS con las variables :root.`
2. `Generá AHORA sólo P-01 Home.`
3. `Generá AHORA sólo P-02 Catálogo.`
4. `Generá AHORA sólo P-03 Producto.`
5. `Generá AHORA sólo C-01 Login customer.`
6. `Generá AHORA sólo C-02 Registro customer.`
7. `Generá AHORA sólo C-03 Perfil customer.`
8. `Generá AHORA sólo C-04 Direcciones.`
9. `Generá AHORA sólo C-05 Carrito.`
10. `Generá AHORA sólo C-06 Checkout (sin UI Mercado Pago).`
11. `Generá AHORA sólo C-07 Resultado de pedido.`
12. `Generá AHORA sólo C-08 Listado de órdenes customer.`
13. `Generá AHORA sólo C-09 Detalle de orden customer.`
14. `Generá AHORA sólo U-01 Login user/operador.`
15. `Generá AHORA sólo U-02 Contenido home admin.`
16. `Generá AHORA sólo U-03 Catálogo admin (productos + marcas + categorías).`
17. `Generá AHORA sólo U-04 Promos MANUAL.`
18. `Generá AHORA sólo U-05 Cola fulfillment.`
19. `Generá AHORA sólo U-06 Detalle fulfillment.`
20. `Generá AHORA sólo U-07 Inventario WEB read-only.`
21. `Generá AHORA sólo U-08 Mercado Libre mapping (sin secretos).`
22. `Generá AHORA sólo U-09 Capabilities (5 estados).`
23. `Generá AHORA sólo U-10 Import de perfil (preview/merge, sin secretos).`

Cuando termines una, devolvés HTML+CSS+capturas. El ingeniero la lista como hecha y pide la siguiente.