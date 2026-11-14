# Especificación funcional — identidad histórica del comprador

## Problema

La orden conserva dirección y customer id, pero no congela el nombre ni el email
del comprador. La experiencia ya reserva ambos campos históricos y hoy los muestra
como no disponibles incluso para una compra nueva.

## Reglas

1. Una orden nueva captura el nombre completo y el email canónicos del CUSTOMER
   autenticado en el instante de creación de la orden.
2. El nombre completo se forma con `first_name.trim() + " " + last_name.trim()`;
   los espacios de unión se normalizan a uno. Ambos campos canónicos son obligatorios
   en el modelo vigente. Si una fila imposible o corrupta no produce nombre/email
   útil, el checkout falla cerrado y no crea evidencia parcial.
3. La identidad nunca llega desde el body de checkout y nunca se deriva del
   destinatario, una dirección, Mercado Pago ni el texto de la sesión.
4. Cambiar el perfil después no modifica una orden existente.
5. Repetir el mismo checkout idempotente devuelve la orden original y no recaptura
   identidad.
6. Una compra nueva posterior a la edición del perfil usa la nueva identidad.
7. Órdenes históricas sin `name` o `email` continúan mostrando cada hecho faltante
   como `UNAVAILABLE / SOURCE_MISSING`; no se reconstruyen.
8. CUSTOMER sólo lee sus órdenes. USER conserva autorización y capability actuales.
   Todas las lecturas siguen siendo `no-store`.

## Fuera de alcance

- Backfill o migración de datos históricos.
- Teléfono, documento fiscal, destinatario o cualquier PII adicional.
- Cambios visuales, de DTO o del contrato HTTP.
- Homologaciones o integraciones externas.

## Criterios de aceptación

- Checkout real persiste `buyer_snapshot.name/email` correctos y los cuatro contratos
  (CUSTOMER/USER, listado/detalle) proyectan sus valores exactos como `KNOWN`.
- Edición posterior del perfil y replay no alteran el snapshot ni duplican efectos.
- Orden posterior a la edición captura los valores nuevos.
- Orden legacy o hecho individual ausente permanece explícitamente no disponible,
  evaluado por campo.
- La protección SQL existente continúa rechazando cualquier modificación del
  snapshot.
- Una identidad canónica inválida falla sin revelar PII y sin crear ningún efecto.
- Checkout concurrente con edición de perfil conserva una versión completa anterior
  o posterior, nunca una combinación de ambas.
