# Spec — simulación de envío

## Problema

El checkout pide dirección y moneda, y fulfillment avanza el próximo estado de un envío ya creado. No hay una pantalla donde el customer vea opciones y un precio simulado antes de pagar.

## Pantallas

Detrás de `customerGuard`.

1. `/checkout/shipping` — precio simulado y el recorrido que esa opción va a caminar.
2. `/customer/orders/:id/envio` — el mismo recorrido, con el estado actual marcado y un botón para pasar al siguiente.

H1 «Envío». Lede de la cotización: «Simulación para esta instalación. No es una cotización de un correo.» Lede del seguimiento: «Simulación del recorrido. Correo Argentino no está conectado.»

La cotización pide carrito con líneas y una dirección del customer. Si falta la dirección, no inventa una.

| Opción | Precio | Plazo |
|---|---|---|
| Retiro | 0 | Lo retira el customer |
| Estándar | 8% del total efectivo del carrito, redondeado al entero y con mínimo 1500 | 3 a 5 días |
| Expreso | 15% del total efectivo, redondeado al entero y con mínimo 3500 | 1 a 2 días |

El total simulado es el efectivo del carrito más la opción elegida. No es el total de la orden. El checkout no lo envía: no se escribe en `orders.total` ni en `shipping_cost`.

## Estados simulados

La consola de fulfillment sigue con su propia transición (empacar, enviar, entregar). Esta línea es la que va a ver el customer y, más adelante, la que va a llenar Correo Argentino. Hoy la llena la simulación.

Retiro: pedido confirmado → pedido en preparación → empaquetado → listo para retirar.

Estándar y expreso: pedido confirmado → pedido en preparación → empaquetado → el envío ya fue despachado → «Tu envío llega el {fecha}».

La fecha es hoy más 5 días (estándar) o más 2 días (expreso), en calendario UTC. No es un plazo del correo. Retiro no tiene fecha de llegada.

El botón «Simular siguiente estado» avanza un paso y se apaga en el último. No escribe la orden, no crea un código de seguimiento y no llama a Correo Argentino.

La elección, el paso y las coordenadas viven en el stand-in HTTP de esta instalación (`/customer/shipping`). No son un envío real.

## Ubicación

En `/checkout/shipping` el customer marca un punto en el mapa (clic o «Marcar donde estoy») o ve el que ya quedó guardado. El mapa usa teselas de OpenStreetMap. No hay clave de Google Maps.

`POST /customer/shipping/location` persiste latitud y longitud. El seguimiento de la orden las muestra en lectura.

La validación es una simulación de cobertura contra el origen que publica la instalación:

| Opción | Regla |
|---|---|
| Retiro | Alcanza con el punto registrado |
| Estándar | Hasta 25 km del origen |
| Expreso | Hasta 10 km del origen |

Sin punto, o con un despacho fuera de ese radio, «Continuar al pago» queda deshabilitado. El origen sale del stand-in, no de una constante de un comercio.

## No hace

No llama a un carrier. No escribe stock. No cambia `shipmentStatus` de la orden. No mezcla USER y CUSTOMER. No cobra, no emite CAE ni PDF, y el total simulado no entra en el total guardado de la orden.

El recurso `GET/POST /customer/shipping` es de la cuenta, no de una orden. El seguimiento vacío dice que no hay simulación guardada en la cuenta.

## Datos para facturar

`/customer/orders/:id/comprobante` guarda nombre, identificación y condición fiscal. `documentStatus` queda `NOT_ISSUED` salvo que el servicio lo marque `ISSUED`. Esta pantalla no emite.
