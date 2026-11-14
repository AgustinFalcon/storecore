# Spec funcional — continuidad checkout/direcciones

## Problema

Un CUSTOMER autenticado sin direcciones llega a checkout, encuentra el selector
vacío y el botón de pago deshabilitado, pero no recibe una acción para resolver
el bloqueo. Además, checkout carga carrito y direcciones en paralelo usando un
error compartido: si direcciones falla primero y carrito responde bien después,
el éxito del carrito borra el error y el retry de direcciones desaparece.

## Historias

### CAC-01 — resolver checkout sin dirección

Como cliente sin direcciones, quiero ir a la administración de direcciones desde
checkout y regresar explícitamente después de guardar una, para continuar la
compra sin perder el contexto.

### CAC-02 — error recuperable y honesto

Como cliente, quiero que un fallo al leer direcciones permanezca visible aunque
el carrito cargue correctamente, para poder reintentar y no quedar bloqueado sin
explicación.

## Reglas

1. Checkout muestra un CTA explícito de dirección cuando la lista confirmada está
   vacía. El pago continúa bloqueado.
2. El destino de retorno es un tipo cerrado. Sólo `Checkout` puede producir el
   enlace `/checkout`; cualquier wire nulo, vacío, desconocido o URL arbitraria
   se traduce a `Unknown` y no genera navegación de retorno.
3. Direcciones muestra el regreso sólo cuando recibió el destino cerrado, existe
   al menos una dirección confirmada del actor vigente y no hay mutación ni
   relectura pendiente.
4. Los estados y errores de lectura de carrito y direcciones son independientes.
   Ningún éxito de un recurso puede borrar el fallo vigente del otro.
5. El retry de lectura vuelve a solicitar ambas lecturas y jamás reenvía un pago.
   El retry de pago es otra acción explícita y conserva su idempotency key.
6. Cada recurso limpia sólo su propio error cuando inicia su nueva lectura. El
   fallo de direcciones queda visible aunque el carrito continúe cargando, y
   viceversa.
7. Cambio de actor limpia direcciones, borrador, errores y destino derivado de la
   ruta, cancela trabajo pendiente e ignora toda respuesta tardía del actor previo.
   El query anterior no se rehidrata automáticamente para el nuevo actor.
8. Una dirección cacheada no habilita pago ni retorno mientras su lectura está
   inicial, cargando, fallida o fue invalidada por guardar/eliminar.
9. Guardar o eliminar invalida lecturas anteriores; sólo el refetch vigente puede
   confirmar lista vacía/lista y habilitar retorno.
10. No se inventan direcciones, costos de envío ni resultados de pago.
11. La lectura del carrito y el intento de pago tienen ciclos independientes. Un
    inicio, éxito o error de GET carrito no puede limpiar el error, loading ni CTA
    de un pago pendiente/reintentable. Sólo una respuesta del intento de pago o
    una revocación explícita de autoridad de moneda/producto puede cambiarlo.

## Aceptación

- Una mutación exitosa del carrito abre una intención nueva si el pago no está
  pendiente: vuelve a `Idle`, limpia el error y rota la clave de idempotencia.
  Un cambio válido de dirección también abre una intención nueva desde
  `Retryable`, `ProductUnavailable` o `Succeeded`. Una lectura GET nunca lo hace.
- Durante `Pending`, no se permiten mutaciones de carrito ni cambios de
  dirección; el selector permanece deshabilitado hasta resolver el intento.

- Cuenta sin direcciones: CTA visible, selector vacío y pago deshabilitado.
- CTA navega a `/customer/addresses?returnTo=checkout`.
- Con una dirección guardada, la pantalla de direcciones ofrece “Volver al
  checkout”. Un retorno desconocido no muestra ese enlace.
- Secuencia `addresses.error → cart.success` conserva error/retry de direcciones.
- Secuencia `cart.error → addresses.success` conserva error/retry de carrito.
- Si carrito queda pendiente y direcciones falla, el error/retry de direcciones
  sigue visible.
- Retry de lectura con un pago retryable coexistente no ejecuta checkout ni rota
  la clave, no borra su CTA aunque GET devuelva carrito vacío y no apaga su
  loading ante respuestas tardías; retry de pago sí reutiliza el mismo intento.
- Un retry de pago perdido sigue disponible con la misma clave aunque una
  relectura posterior del carrito ya no contenga líneas.
- A→B cancela list/save/delete y respuestas tardías de A no publican lista,
  borrador ni retorno bajo B.
- Durante refresh, error o mutación, una lista cacheada no habilita pago/retorno.
- Cambiar o quitar `returnTo` en la misma instancia actualiza el enlace.
- Los nuevos mensajes conservan `role="alert"`/`role="status"`, nombre accesible y
  navegación por teclado.
