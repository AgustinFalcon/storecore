# Especificación técnica — identidad histórica del comprador

## Diseño

`JdbcCartService.checkout` ya corre dentro de `IdentityMutationCoordinator` y su
transacción. El coordinador adquiere la raíz CUSTOMER, bloquea sus sesiones y
revalida al actor. La edición de perfil usa el mismo orden de locks. El adapter de
checkout leerá `email`, `first_name` y `last_name` desde `customers` inmediatamente
después de descartar todos los caminos de replay y antes de dirección, locks de
inventario, claim, reservas o cualquier otro efecto.

La captura vive en un objeto interno de responsabilidad única, que:

- acepta sólo valores canónicos leídos de DB;
- normaliza la composición del nombre;
- rechaza identidad vacía/corrupta;
- traduce una única vez a JSON en el borde JDBC.

Una fila faltante/inactiva produce el fallo de autenticación ya establecido. Una
fila presente con nombre o email vacío/corrupto produce HTTP 409, `retryable=false`,
y el código estable y no revelador `CUSTOMER_IDENTITY_UNAVAILABLE`, representado por
una subclase específica de la jerarquía sellada `CommerceException`, sin devolver PII.

No se introduce un nuevo estado finito: `OrderFact` y sus tipos cerrados existentes
ya representan `KNOWN`, `UNAVAILABLE` y valores desconocidos. No se agregan strings
mágicos en vista, store o tests.

## Persistencia e idempotencia

- Se agregan `name` y `email` al objeto `buyer_snapshot` existente junto a customer,
  address y domicilio.
- `checkout_request_hash` no incorpora perfil mutable.
- El replay se resuelve antes de leer/capturar identidad y conserva la orden creada.
- El trigger inmutable existente continúa siendo la autoridad contra updates y
  deletes.
- No se modifica V1 ni se agrega migración: JSONB ya admite las claves.

## Contrato de lectura

`JdbcOrderProjection` continúa leyendo sólo `buyer_snapshot.name/email`. Ausencia,
vacío o tipo no textual se proyecta por campo como `UNAVAILABLE/SOURCE_MISSING`.
Está prohibido hacer join o fallback a `customers` para completar historia.

## Pruebas

1. Integración HTTP de checkout: snapshot DB correcto y `KNOWN` en CUSTOMER/USER,
   listado/detalle.
2. Perfil editado: la orden anterior permanece igual; replay permanece igual; una
   orden nueva refleja la nueva identidad.
3. Legacy parcial/ausente: indisponibilidad individual sin fallback.
4. Identidad inválida: rollback y ausencia de claim, reserva, orden y pago.
5. Carrera perfil/checkout: por el lock CUSTOMER el snapshot completo es anterior o
   posterior; nunca combina email nuevo con nombre viejo.
6. Inmutabilidad SQL existente sigue verde.
7. Regresión completa de backend y gates del repositorio.

## Seguridad y privacidad

- La fuente es el principal autenticado revalidado y su fila canónica, nunca input.
- No se amplía la PII almacenada más allá de nombre/email requeridos por el contrato.
- Ownership, realms, capability y `Cache-Control: no-store` permanecen intactos.
