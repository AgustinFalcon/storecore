# Spec funcional — decisión de entrega en checkout

## Problema

El checkout productivo exige siempre una dirección, muestra que el costo de entrega
no está disponible y crea órdenes con envío cero. La demo ya permite retiro o envío,
pero esa elección todavía no existe en el flujo real. Esto impide presentar un total
final confiable y permite que Mercado Pago cobre solo mercadería.

## Resultado esperado

1. El comprador recibe únicamente opciones de cumplimiento habilitadas por la
   instalación: retiro en local y/o entrega local.
2. Cada opción muestra nombre, costo ARS, plazo estimado y si requiere dirección.
   Retiro muestra además lugar e instrucciones antes de que el comprador confirme.
3. Retiro no exige dirección. Entrega local exige una dirección vigente del mismo
   cliente.
4. El resumen muestra subtotal, entrega y total final antes de confirmar.
5. Al confirmar, el backend vuelve a resolver la opción desde configuración; nunca
   acepta costo, plazo, etiqueta ni total enviados por el navegador.
6. La orden, el reclamo idempotente y el pago conservan el mismo modo, costo, plazo,
   versión de configuración, destino e instrucciones inmutables.
7. Repetir la misma clave con los mismos hechos devuelve la misma orden. Cambiar
   modo, dirección, revisión de carrito/dirección o moneda con esa clave produce
   conflicto.
8. Una opción que cambia o se deshabilita antes de confirmar falla cerrada y obliga
   a recargar. No cobra con una cotización obsoleta.
9. Un valor desconocido de modo o una configuración inválida nunca se presenta ni
   se degrada a envío gratis.
10. Si no hay opciones válidas, el checkout informa indisponibilidad y no permite
    pagar.
11. La selección conserva la cotización exacta que el comprador aceptó. Una nueva
    lectura no puede sustituir silenciosamente costo, plazo o versión; debe
    invalidar la aceptación y pedir una nueva confirmación.
12. El ciclo operativo distingue los modos. Entrega usa preparando, enviado y
    entregado, con tracking opcional. Retiro usa preparando, listo para retirar y
    retirado, sin pedir ni mostrar tracking.
13. La confirmación identifica la revisión autoritativa del carrito y, cuando
    corresponde, de la dirección que el comprador vio. Si un primer envío no creó
    reclamo y esos hechos cambiaron, el reintento falla cerrado, recarga y exige
    una nueva confirmación; nunca cobra el estado más nuevo bajo la vista congelada.

## Configuración operativa

`MANUAL_FULFILLMENT` es la autoridad de esta fase. Su configuración versionada
declara por separado retiro y entrega local. Para cada opción habilitada se exige:

- etiqueta comercial no vacía;
- costo ARS exacto, no negativo y con hasta dos decimales;
- mínimo y máximo de días enteros, con `0 <= min <= max`;
- para retiro, instrucciones y lugar de retiro no vacíos;
- para entrega local, la dirección del comprador se valida al confirmar.

Los días estimados se cuentan desde la acreditación del pago. La instalación migra
a un documento válido con ambas opciones deshabilitadas: no inventa defaults
comerciales ni queda cotizable. Un administrador debe cargar la política mediante
el comando versionado y auditado antes de activar una opción.

## Seguridad y consistencia

- Modos y estados son tipos cerrados con caso `Unknown` en los bordes.
- Backend calcula dinero con decimal exacto y paga `subtotal + shippingCost`.
- La selección se bloquea durante un intento; cambiarla abre una clave nueva.
- Los snapshots son evidencia histórica, no se recalculan tras editar configuración.
- Se conservan autenticación CUSTOMER, CSRF, capacidad de checkout y aislamiento.
- El frontend no interpreta strings de modo ni decide si una dirección es necesaria.

## Fuera de alcance

- Cotización, etiqueta, tracking u homologación de Correo Argentino.
- Geocodificación, cobertura por código postal o cálculo por distancia/peso.
- Edición visual de la configuración de fulfillment. Esta fase sí incorpora el
  contrato administrativo tipado necesario para operarla; una futura pantalla lo
  consumirá sin cambiar el dominio.
- Envíos de Mercado Libre y preparación logística avanzada.
- Recalcular pedidos históricos.

## Criterios de aceptación

- Retiro sin direcciones puede completar una orden con costo cero configurado.
- Entrega local requiere dirección propia y cobra el costo configurado.
- El importe del pago coincide con el total de orden incluido el envío.
- Snapshots y proyección de pedido conservan modo, etiqueta, plazo, destino y versión.
- Cambio concurrente de configuración invalida la selección anterior.
- Cambio concurrente del carrito o de la misma dirección antes de crear el reclamo
  invalida el intento sin reservar, ordenar ni cobrar. Un reclamo ya creado sigue
  reproduciendo su evidencia histórica aunque esos recursos hayan cambiado.
- Retiro nunca se presenta como enviado ni exige tracking y habilita devolución
  solamente después de quedar retirado.
- Retiro funciona aunque la cuenta no tenga direcciones o la lectura de direcciones
  falle; al pasar de entrega a retiro no se envía una dirección residual.
- Wires desconocidos/config inválida fallan cerrados en backend y frontend.
- Pruebas de dominio, HTTP, store, vista y E2E real pasan junto a todos los gates.

