# Functional Spec — StoreCore

**Versión:** 1.0  
**Fecha:** 2026-05-15  
**Estado:** HISTÓRICO — el rótulo “APROBADO” es registro de 2026-05-15, no gate vivo  
**Fuente:** Consolidado de docs/02, docs/03, docs/06, docs/08

> **NO IMPLEMENTAR.** Documento legado. El baseline vigente está archivado en `sdd/features/20260921-single-tenant-installation-baseline/`. El WIP `20260819-store-tenancy-and-profiles` también está **superseded**. Companion vivo: BlackStore `blackstore-pilot` + YAML StoreCore `storecore-pos-integration-contract-v1`. Conserva CUs USER≠CUSTOMER como evidencia; no define tenancy, POS ni stock companion.

---

## Resumen del sistema

StoreCore es una plataforma de e-commerce dedicada para emprendedores y PyMEs argentinas. Cada comercio tiene su propia tienda online con dominio, branding, catálogo, stock, y cobro integrado con Mercado Pago.

<!-- deprecated: sdd/wip/20260819-store-tenancy-and-profiles -->

**Modelo de negocio Fase 1:** un deploy aislado por cliente — una instancia, una base de datos, credenciales MP propias. Sin complejidad multi-tenant hasta que el volumen lo justifique.

**Primer cliente de referencia:** tienda de indumentaria (ropa, calzado, accesorios) con variantes de talle y color.

---

## Actores

| Actor | Descripción | Sistema |
|-------|-------------|---------|
| **ADMIN** | Dueño o administrador del comercio. Acceso total al panel admin. | Backoffice Angular |
| **OPERATOR** | Empleado del comercio. Puede ver y actualizar pedidos y catálogo, pero no config sensible. | Backoffice Angular |
| **CUSTOMER** | Comprador registrado en el storefront. Distinto de USER — JWT separado. | Storefront Angular |
| **VISITOR** | Visitante no autenticado. Puede navegar el catálogo y agregar al carrito. | Storefront Angular |
| **Sistema MP** | Mercado Pago. Envía webhooks al backend al confirmar/rechazar pagos. | Externo (webhook) |
| **Job interno** | Proceso scheduled del backend. Limpia carritos expirados, libera stock reservado. | Backend |

> **Regla clave:** USER (staff) ≠ CUSTOMER (comprador). Son entidades separadas, JWT distintos, endpoints distintos, rutas distintas. Un empleado del comercio nunca comparte sesión con un comprador.

---

## Casos de Uso — Storefront (comprador)

### CU-01: Navegar catálogo
**Actor:** VISITOR / CUSTOMER  
**Descripción:** Ver página de inicio, listado de productos por categoría, búsqueda básica. Ver detalle de producto con fotos, descripción, variantes (talle/color), stock disponible.  
**Resultado:** Información del producto visible; botón "Agregar al carrito" activo si hay stock.

### CU-02: Gestionar carrito
**Actor:** VISITOR / CUSTOMER  
**Descripción:** Agregar/quitar productos al carrito. El carrito es anónimo (cookie de sesión) hasta el login. Al iniciar sesión, el carrito se asocia al CUSTOMER. TTL de 7 días de inactividad.  
**Resultado:** Carrito persistido con precios snapshot al momento de agregar.

### CU-03: Checkout con Mercado Pago
**Actor:** CUSTOMER (login obligatorio en Fase 1)  
**Descripción:** Desde el carrito → login si no autenticado → resumen del pedido (snapshot de items + dirección) → backend crea `preference` en MP → redirect al `init_point` de MP → comprador paga en sitio de MP → MP notifica al backend vía webhook.  
**Resultado:** ORDER creada en estado CREATED → PENDING_PAYMENT → (webhook) → PAID.  
**Regla:** El stock se reserva al crear la preference. Si el pago no se confirma en 30 min, el stock se libera.

### CU-04: Ver resultado post-pago
**Actor:** CUSTOMER  
**Descripción:** MP redirige a back_urls definidas (success, failure, pending). El backend muestra estado del pedido al comprador.  
**Resultado:** Comprador ve confirmación de pedido o mensaje de error.

### CU-05: Ver historial de pedidos
**Actor:** CUSTOMER  
**Descripción:** Lista de pedidos propios con estado actual (pagado, en preparación, enviado, entregado).  
**Resultado:** Listado paginado de pedidos con detalle por ítem.

### CU-06: Registro y login de comprador
**Actor:** VISITOR  
**Descripción:** Crear cuenta con email + password. Login para acceder al checkout e historial.  
**Resultado:** JWT de CUSTOMER emitido. Carrito anónimo migrado al CUSTOMER.

---

## Casos de Uso — Panel Admin (staff)

### CU-07: Login del staff
**Actor:** ADMIN / OPERATOR  
**Descripción:** Login con email + password. JWT de USER emitido (diferente al JWT de CUSTOMER).  
**Resultado:** Acceso al panel admin según rol.

### CU-08: Gestionar catálogo
**Actor:** ADMIN / OPERATOR  
**Descripción:** CRUD de categorías, productos (con fotos como URLs), variantes (talle/color/precio/stock), estado del producto (DRAFT/ACTIVE/ARCHIVED).  
**Resultado:** Catálogo disponible en el storefront en tiempo real.

### CU-09: Gestionar pedidos
**Actor:** ADMIN / OPERATOR  
**Descripción:** Ver listado de pedidos. Ver detalle de un pedido (comprador, items, pago, envío). Actualizar estado de envío manualmente (PREPARING → SHIPPED → DELIVERED). Agregar número de seguimiento.  
**Resultado:** Estado del pedido actualizado; comprador ve el cambio en su historial.

### CU-10: Configurar la tienda
**Actor:** ADMIN  
**Descripción:** Nombre, logo, banner, colores, redes sociales, políticas (devolución, términos). Datos fiscales (CUIT, razón social — informativo, no envía a AFIP).  
**Resultado:** Storefront refleja la configuración visual del comercio.

### CU-11: Configurar Mercado Pago
**Actor:** ADMIN  
**Descripción:** Ingresar access_token y public_key de MP. El sistema valida que las credenciales son válidas antes de guardar. El access_token se cifra en reposo.  
**Resultado:** El checkout usa las credenciales propias del comercio.

### CU-12: Ver dashboard
**Actor:** ADMIN / OPERATOR  
**Descripción:** Resumen del día: pedidos recientes, stock bajo, ventas del mes.  
**Resultado:** Vista rápida del estado operativo del negocio.

### CU-13: Ver clientes
**Actor:** ADMIN / OPERATOR  
**Descripción:** Lista de CUSTOMERs registrados con historial de compras.  
**Resultado:** Vista de base de clientes.

---

## Casos de Uso — Sistema (automático)

### CU-14: Procesar webhook de Mercado Pago
**Actor:** Sistema MP → Backend  
**Descripción:** MP envía POST al `notification_url`. El backend:
1. Verifica firma `x-signature`
2. Intenta `INSERT INTO mp_webhook_events(notification_id)` — si ya existe, devuelve HTTP 200 sin reprocesar
3. Si insertó: consulta la API de MP para datos completos
4. Actualiza `payments.status` y `orders.status` según la tabla de mapeo
5. Actualiza stock según el resultado (reservado → vendido o reservado → disponible)
6. Marca webhook como PROCESSED  
**Resultado:** Pedido actualizado idempotentemente. MP siempre recibe HTTP 200.

### CU-15: Limpiar carritos expirados
**Actor:** Job interno (scheduled)  
**Descripción:** Cada N minutos, busca carritos con `expires_at < NOW()`, libera stock reservado de items pendientes, elimina los carritos.  
**Resultado:** Stock liberado, base limpia.

### CU-16: Limpiar preferences expiradas
**Actor:** Job interno (scheduled, cada 5 min)  
**Descripción:** Preferences de MP tienen TTL de 30 min. Si no se pagaron, se liberan los stocks reservados asociados.  
**Resultado:** Stock disponible liberado para otros compradores.

### CU-17: Enviar email de confirmación
**Actor:** Backend (al transicionar ORDER a PAID)  
**Descripción:** El backend envía email al comprador con detalle del pedido (número, items, total, dirección) usando Spring Mail con template HTML.  
**Resultado:** Comprador recibe confirmación por email.

---

## Reglas de Negocio

| ID | Regla | Área |
|----|-------|------|
| RN-01 | El checkout requiere login obligatorio en Fase 1. El modelo prepara `customer_id nullable` para guest checkout en Fase 2 sin migración. | Checkout |
| RN-02 | El stock se reserva pesimistamente al crear la preference (`SELECT FOR UPDATE` en `product_variants`). | Stock |
| RN-03 | Si el pago no se confirma en 30 min, el stock reservado se libera (job de limpieza). | Stock |
| RN-04 | Un webhook de MP con el mismo `notification_id` se procesa exactamente una vez (`INSERT ON CONFLICT DO NOTHING`). | Pagos |
| RN-05 | El webhook siempre devuelve HTTP 200, incluso si es duplicado. MP reintenta si recibe otro código. | Pagos |
| RN-06 | `buyer_snapshot` y `product_snapshot` son JSONB inmutables en `orders` y `order_items`. Nunca se actualizan post-creación. | Pedidos |
| RN-07 | `external_reference` en `payments` = `order_number` del pedido. Es la clave de correlación con MP. | Pagos |
| RN-08 | `access_token` de Mercado Pago se cifra en reposo en `payment_configs`. Nunca aparece en logs. | Seguridad |
| RN-09 | USER (staff) y CUSTOMER (comprador) tienen JWT distintos, endpoints distintos y no comparten sesión. | Auth |
| RN-10 | Los campos `document_type` y `document_number` son opcionales en Fase 1. El modelo los prepara para AFIP en Fase 2. | Compliance |
| RN-11 | El estado de ORDER sigue al estado de SHIPMENT: cuando el staff actualiza el envío a DELIVERED, la ORDER pasa a DELIVERED automáticamente. | Pedidos |
| RN-12 | No se emiten facturas electrónicas en Fase 1. El onboarding fiscal con el contador del cliente es prerequisito antes del primer deploy. | Compliance |
| RN-13 | Las imágenes de productos se almacenan como URLs externas. El backend no gestiona archivos binarios en Fase 1. | Catálogo |

---

## Máquinas de estado

### ORDER
```
CREATED → PENDING_PAYMENT → PAID → PREPARING → SHIPPED → DELIVERED
                         ↘ CANCELLED
                                   ↘ REFUNDED (desde PAID, PREPARING, SHIPPED)
```

### PAYMENT
```
PENDING → APPROVED
        → REJECTED
        → CANCELLED
APPROVED → REFUNDED
         → CHARGED_BACK
```

### SHIPMENT
```
PENDING → PREPARING → READY_TO_SHIP → SHIPPED → DELIVERED
                                    ↘ FAILED → SHIPPED (reintento) o RETURNED
```

**Notificaciones email al comprador:** ORDER PAID (confirmación), ORDER SHIPPED, ORDER DELIVERED, ORDER CANCELLED, ORDER REFUNDED.

---

## Dependencias externas

| Dependencia | Tipo | Uso |
|-------------|------|-----|
| Mercado Pago Checkout Pro | Pagos | Checkout, webhooks, gestión de preferencias |
| SMTP (Gmail App Password) | Email | Notificaciones al comprador |
| No-IP DDNS | DNS | Hostname dinámico por cliente |
| Let's Encrypt / Certbot | SSL | Certificado HTTPS por cliente |
| GitHub Actions | CI/CD | Deploy automático al push a master |

---

## Features Fase 1 vs Fase 2

### Fase 1 (MVP — lo que se construye ahora)
Storefront: catálogo, carrito, checkout MP, historial de pedidos, registro/login comprador.  
Admin: CRUD catálogo, gestión pedidos y envíos, config tienda, config MP, dashboard, vista clientes.  
Backend: 9 módulos (catalog, inventory, cart, order, payment, shipment, customer, store, auth, notification).  
Infra: VM dedicada, Docker Compose, Nginx+SSL, GitHub Actions.

### Fase 2 (post-MVP, no bloquean Fase 1)
Guest checkout, integración logística (Andreani/OCA), facturación ARCA/AFIP, cuotas MSI, cupones, reviews, wishlist, variantes con matriz SKU, multi-tenant, app móvil.

### Fuera del MVP bajo cualquier circunstancia
No AFIP/ARCA, no logística automatizada, no marketplace, no WhatsApp, no app nativa, no Stripe.

---

## Criterio de éxito del MVP

El MVP está completo cuando el primer cliente puede:
1. Acceder al panel admin, configurar la tienda y cargar productos con variantes y stock
2. Un comprador puede navegar el storefront, agregar al carrito y pagar con Mercado Pago
3. El pago se refleja en el admin como pedido pagado
4. El staff puede actualizar el estado de envío y el comprador ve su historial
5. El sistema envía email de confirmación al confirmar el pago
