# Spec técnico — contrato V3 y carga integral

## Diseño

El contrato `ShowcaseDataset` incorpora V3 sin romper V1/V2. Todo conjunto finito se traduce una sola vez a tipos cerrados: versión, estado de oferta, tipo de descuento, tipo de bloque, perfil de seed y política de replay. Un valor desconocido falla cerrado.

V3 agrega `experience`:

- `cart`: SKUs y cantidades exactas.
- `favoriteSkus`: miembros exactos.
- `addresses`: tres domicilios sintéticos.
- `offers`: clave estable, ventana relativa, prioridad, descuento, SKUs y estado objetivo.
- `home.sections`: bloques tipados; categorías se resuelven por nombre contra los IDs persistidos.

## Pipeline

Cada etapa tiene una responsabilidad y el coordinador fija el orden:

1. preflight, autenticación y seguridad externa;
2. validación completa de capacidades y marcador de importación;
3. catálogo y composición comercial;
4. cliente, direcciones y pedido pendiente seguro;
5. carrito y favoritos;
6. ofertas y cierre del marcador;
7. readback y recibo.

El loader sólo crea recursos identificados por el dataset. Preserva datos ajenos y cambios posteriores del operador. La segunda ejecución debe producir cero duplicados.

La reanudación de ciclos de oferta no se deduce de Home vacío ni del estado comercial. Antes de la primera mutación V3 se persiste por CAS una sección Home inactiva `PENDING`, ligada al SHA-256 del dataset. Sólo ese marcador exacto autoriza reanudar. Al completar todas las ofertas se elimina por CAS: si Home estaba vacío se publica la portada del dataset; si había composición del operador se restaura sin modificaciones. Sin marcador, las ofertas existentes se preservan; una coincidencia parcial falla cerrada.

## Autoridad comercial

Los pedidos pagados requieren pago, intento de checkout, aplicación comercial, reserva consumida y ledger. Se implementarán en un importador de escenarios local separado y explícito; nunca mediante el endpoint productivo ni debilitando guards. El perfil proveedor-libre mantiene checkout pendiente.

## Verificación

- Tests unitarios del traductor V3, Unknown, límites, referencias y congelamiento.
- Test HTTP del loader con replay y estados de oferta.
- PostgreSQL real: conteos, membresía y distribución.
- El gate productivo carga el dataset V3 integral, no el fixture de catálogo reducido, y afirma en PostgreSQL: 80 productos/variantes, 5 balances sin stock, 7 secciones Home, 12 ofertas con distribución 4/4/2/2, 3 direcciones, 5 líneas de carrito y 12 favoritos del comprador showcase.
- Playwright: assertions de contenido exacto por superficie y flujos comprador/admin.
- CI existente completo y dos reviews GPT-6.1 Sol sobre el mismo SHA.

## Seguridad y privacidad

- Sólo loopback.
- Correos `.invalid`.
- URLs de imagen HTTPS allowlisted.
- Integraciones externas deshabilitadas.
- El recibo no incluye credenciales.
