# Spec funcional — continuidad de intención desde la ficha de producto

## Problema

La ficha de producto permite elegir variante y cantidad, pero una persona anónima
que intenta comprar es enviada a `/login` sin conservar esa elección. Al volver,
la vista puede seleccionar la primera variante disponible, con riesgo de mostrar
una combinación distinta y de obligar a reconstruir el recorrido.

## Resultado esperado

1. El CTA comercial anónimo captura producto, variante exacta y cantidad antes de
   iniciar login o registro.
2. El borrador vive solo en `sessionStorage`, una pestaña y durante 15 minutos.
3. Login CUSTOMER directo, selección CUSTOMER en un challenge dual y registro
   CUSTOMER conservan una referencia opaca al mismo borrador.
4. Una sesión CUSTOMER ya aceptada no crea otra cuenta: vuelve directamente a la
   ficha y ejecuta la reconciliación de lectura.
5. Una sesión USER exclusiva conserva su home. Elegir USER en el challenge nunca
   restaura ni ejecuta una intención comercial.
6. Tras autoridad CUSTOMER aceptada, la aplicación relee la ficha y el carrito,
   restaura únicamente la variante exacta y muestra: “Revisá precio y
   disponibilidad y confirmá para agregar”.
7. No se envía `PUT /customer/cart/items` antes de una confirmación explícita.
8. El `PUT` existente conserva semántica SET. Si ya hay `N` unidades, la vista
   explica que confirmar dejará `M`; no promete sumar `M` a `N`.
9. Precio, ofertas, estado del producto y disponibilidad se toman de la lectura
   fresca del servidor. Checkout conserva la autoridad de reserva/stock.
10. Variante ausente, inactiva, ajena, sin stock o cantidad inválida bloquean la
    confirmación y ofrecen corregir o cancelar; nunca caen a la primera variante.
    Una corrección explícita crea una nueva revisión del borrador, invalida la
    evaluación anterior y vuelve a comprobar la selección mostrada.
11. Login/registro/reconciliación fallidos preservan el borrador hasta vencer o
    cancelarse. El reintento posterior a un alta aceptada no repite el POST de alta.
12. Éxito, cancelación, vencimiento o inicio de un nuevo flujo limpian/reemplazan
    el borrador con un mensaje visible.
13. Inmediatamente antes de confirmar se vuelven a comprobar flowId, revisión,
    TTL, CUSTOMER y generación del actor. Si venció antes del envío, se bloquea y
    se ofrece iniciar otro flujo. Si vence con el PUT ya enviado, primero se
    determina su resultado: el vencimiento no revierte ni disfraza un efecto
    servidor.
14. La confirmación distingue `Pending`, `Accepted`, `Rejected` y
    `OutcomeUnknown`. Nunca reintenta el PUT automáticamente. Ante resultado
    desconocido, relee el carrito, muestra lo observado y exige una confirmación
    nueva antes de otro SET.
15. Un PUT aceptado pasa inmediatamente a `Completed` y deshabilita la
    confirmación. El refresh y la limpieza son efectos posteriores; su fallo no
    vuelve el flujo a listo ni repite la mutación.

## Datos persistidos

El wire versionado contiene solo:

- versión de contrato;
- identificador opaco de flujo;
- clase cerrada de intención;
- SKU de producto;
- SKU de variante exacta;
- cantidad entera;
- instante de emisión y vencimiento.

No contiene precio, oferta, stock, credenciales, cookies, customerId, roles ni una
URL libre.

## Estados cerrados

- Clase de intención: `AddCartLine`, `None`, `Unknown`.
- Etapa: `Captured`, `AwaitingCustomer`, `Restoring`,
  `ReadyForConfirmation`, `Unavailable`, `Expired`, `Completed`, `Unknown`.
- Resultado de confirmación: `Idle`, `Pending`, `Accepted`, `Rejected`,
  `OutcomeUnknown`, `Unknown`.
- Disponibilidad restaurada: `Ready`, `ProductUnavailable`,
  `VariantUnavailable`, `QuantityUnavailable`, `Unknown`.

La vista etiqueta y decide mediante esos tipos; no compara strings de wire.

## Seguridad y privacidad

- `fromWire` es el único traductor y todo input malformado, futuro, vencido o
  desconocido termina en `Unknown`/borrado fail-closed.
- La navegación comercial se reconstruye con el SKU ya validado; nunca se acepta
  una URL, host, esquema, query o fragmento del storage.
- La referencia opaca no autoriza la operación. CUSTOMER + CSRF + relecturas
  servidoras siguen siendo necesarias.
- Un cambio de actor, logout o respuesta tardía invalida el claim en curso; una
  respuesta de otro actor no puede publicar estado ni mutar carrito.
- Fallo de storage/cuota se informa y no se afirma que la selección fue guardada.

## Fuera de alcance

- Autoagregar o exactamente-una-vez en backend.
- Carrito invitado, merge de carritos o suma incremental.
- Recuperación cross-device, cross-tab o desde un enlace de email abierto fuera de
  la pestaña original.
- Cambios a precios, stock, checkout, Mercado Pago u homologaciones.
- Persistir la intención en DB o dentro del challenge dual-realm.

## Criterios de aceptación

- Variante no predeterminada y cantidad 2 sobreviven login simple, challenge dual
  CUSTOMER y registro, sin `PUT` previo a confirmar.
- Fallos y reintentos conservan intención; reconciliar un alta no repite registro.
- USER nunca recibe efecto comercial ni pierde su destino autorizado.
- Refresh/back funciona durante TTL y no revive un borrador consumido o vencido.
- Una apertura ordinaria de login no revive intención vieja ni desplaza retornos
  CART/CHECKOUT.
- Inputs corruptos, versiones futuras, qty fuera de rango, variante ajena y storage
  no disponible fallan de forma visible y cerrada.
- Producto/variante/stock/precio cambiados se resuelven contra la lectura fresca.
- Éxito seguido de refresh/back no repite el `PUT`.
- PUT aceptado seguido de GET fallido o clear fallido permanece terminal y no
  habilita otro envío. Si Web Storage no permite escribir un tombstone, el bloqueo
  en memoria se garantiza durante la instancia y la pantalla informa que no puede
  garantizarse la limpieza durable tras recargar.
- Timeout ambiguo relee el carrito y requiere una nueva confirmación; no reenvía.
- Vencimiento en listo, edición durante refetch y cancelación con PUT en vuelo
  conservan el resultado servidor y no publican una revisión vieja.
- Corregir cantidad insuficiente o elegir otra variante produce un único PUT con
  la cantidad final que la persona vio y confirmó.
- Pruebas de navegador cubren foco y anuncios accesibles.
- Regresiones de retorno CART/CHECKOUT/USER permanecen verdes.
