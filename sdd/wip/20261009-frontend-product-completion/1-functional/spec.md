# Requisitos y escenarios observables

## FE-COMP-01 — contrato de completitud

R01: inventariar cada ruta, tab, diálogo, CTA, validación, estado vacío/error/carga y permiso por rol. Cada control debe producir navegación, cambio de estado o información útil; una notificación genérica no sustituye guardar, filtrar, recuperar o devolver. El denominador incluye controles nuevos, condicionales y deshabilitados con motivo. Mantener trazabilidad con las 24 rutas actuales; agregar rutas explícitas si el recorrido lo requiere, sin tratar 24 como techo.

R02: cada corte demuestra un recorrido comprador→administrador→comprador con identidad y estado persistente, recarga y repetición de operación; revisar 390, 768 y 1440 px, teclado, foco, lectores de pantalla, zoom 200%, textos largos, listas vacías y listas extensas. Registrar defectos P1/P2 y corregirlos antes de cierre. Revisión independiente de UX/producto y funcional; capturas solo acreditan aspecto visual, no efectos.

## FE-COMP-02 — producto, galería y carrito multivariante

E02.1: admin crea un producto con nombre, descripción, marca/categoría, atributos, imágenes con texto alternativo y al menos dos variantes vendibles con identidad estable, precio y stock propio. Vista previa coincide con catálogo/detalle publicados. Validar duplicados, importes/cantidades inválidos y campos obligatorios. Archivar no borra pedidos históricos.

E02.2: comprador filtra/busca, entra al producto, recorre imágenes realmente diferenciadas y zoom accesible, elige variante y cantidad; precio/disponibilidad cambian para esa variante. Sin stock o archivada impide agregar y explica por qué. La variante desconocida se presenta como no disponible.

E02.3: agrega dos variantes del mismo producto y otro producto; cada línea conserva identidad, imagen, atributos, precio y cantidad. Editar/eliminar una línea no altera la otra. Repetir agregado fusiona solo la misma variante. Cantidades cero, negativas, fraccionarias, NaN e infinitas no producen consumo; eliminar es una acción explícita. Totales usan unidades monetarias menores enteras.

E02.4: una edición admin posterior no reescribe el pedido confirmado. Cambio de precio/stock antes de confirmar compra exige resumen actualizado y confirmación; persistencia legacy traduce de forma explícita o informa necesidad de restablecer, nunca asigna otra variante silenciosamente.

## FE-COMP-03 — postventa y reembolso parcial

E03.1: desde pedido propio entregado, comprador selecciona líneas/cantidades y motivo, ve resumen y envía solicitud. Puede consultar estado y cancelar mientras aún no fue procesada. No solicita más que lo comprado menos devoluciones ya procesadas.

E03.2: admin filtra solicitudes, revisa detalle e historial, acepta/rechaza con motivo, registra recepción e inspección y decide reposición apta o no apta. Reembolso parcial conserva total original, importe devuelto acumulado y saldo. Reembolso y reposición son efectos separados; no devolver stock por solo solicitar dinero.

E03.3: doble clic/reintento/recarga no repite reembolso ni ingreso. Descuento asignado por línea se congela al comprar; suma de reembolsos nunca supera lo cobrado. Gastos de envío se muestran separados y no se reembolsan automáticamente. Estados y comprobante reflejan la simulación; no se promete reintegro bancario.

## FE-COMP-04 — entrega, retiro e incidencias

E04.1: checkout permite domicilio o retiro. Domicilio exige dirección válida y muestra costo/plazo; retiro exige punto/horario y no fuerza dirección postal. El pedido congela modalidad, destino, costo y plazo.

E04.2: admin prepara pedido pagado; domicilio permite despachar con tracking simulado y entregar, retiro permite listo para retirar y entrega en mostrador con confirmación. No usar un tracking de correo ficticio para describir retiro. Pendiente/rechazado/cancelado no habilita despacho.

E04.3: incidencia abre evento, motivo, responsable y siguiente acción; resolución deja historial visible al comprador. Inbox de alertas enlaza al pedido correcto, distingue leído/resuelto y no elimina eventos al marcar leído; preferencias por tipo controlan aviso local sin borrar el historial. Repetir transición es idempotente; Unknown no autoriza operación.

## FE-COMP-05 — acceso y administración utilizables

E05.1: entrada demo única con perfiles de muestra identificados; navegación protegida conserva intención validada (producto/carrito/checkout/pedido propio), salir y cambiar de comprador no revela pedidos/carrito/direcciones ajenos. Contextos admin/comprador explícitos, con homes útiles por responsabilidad.

E05.2: recuperación simulada presenta solicitud, confirmación neutral, token vencido/usado y regreso a login; no pide ni envía credenciales reales. Registro/perfil/direcciones validan datos y conservan intención segura. Email duplicado dentro del mismo contexto se rechaza; perfiles de muestra se eligen explícitamente y no se representa cualquier contraseña como autenticación real. Documentar los estados que se simulan y cómo dispararlos.

E05.3: admin presenta pendientes accionables y contadores que concuerdan con listas filtradas. Productos, stock, ventas, promociones y contenido tienen búsqueda, filtros, orden, vacíos, paginación o límite explícito; editar→guardar→recargar persiste, cancelar no modifica. Venta abre pedido y eventos; alertas llevan al objeto afectado. Acciones restringidas muestran motivo comprensible.

## FE-COMP-06 — contrato visual ML y competencia

E06.1: cuenta desconectada, autorizada simulada, vencida/error y pausada son estados cerrados; muestra última actividad y acción útil. Publicaciones vinculan SKU/variante local a identidad de listing/variation de muestra y exponen conflictos de mapping sin resolverlos por nombre.

E06.2: stock local disponible, deseado, observado y confirmado son valores distintos con fecha. Venta web y venta ML simulada generan eventos deduplicados por operación; procesar/reintentar cola converge, repetir evento no descuenta dos veces. Error o pausa conserva deuda visible. Sin vender por debajo de disponibilidad ni inventar éxito remoto.

E06.3: watchlist relaciona producto comparable, fuente de muestra, precio observado, fecha, umbral e historial. Cambio dispara alerta deduplicada; leído no equivale a resuelto. Datos viejos/no disponibles visibles. Comparación no altera precio propio; cualquier propuesta requiere revisión explícita. Sin scraping ni acceso a competidores reales en este corte.

## Fixtures y recorridos cruzados

F01: dos compradores con pedidos/direcciones distintos, un administrador y visitante; F02: producto con variantes A/B, stock 3/0 y precios distintos, otro producto disponible, archivado y uno sin imagen; F03: pedido multivariante con descuento, envío cobrado y dos unidades retornables; F04: pendientes/aprobados/rechazados/cancelados y pago reintentable; F05: domicilio, retiro e incidencia abierta/resuelta; F06: mappings ML válidos/conflictivos, cola pendiente/error/confirmada y observación competidor reciente/vieja.

J02: `/demo/user/catalog`→`/demo/catalog/:sku`→`/demo/cart`→`/demo/checkout`→resultado→`/demo/user/inventory`→ambos detalles de pedido.
J03/J04: `/demo/customer/orders/:id`→solicitud/seguimiento→`/demo/user/orders/:id`→resolución→detalle comprador y alertas.
J05: login/recuperación→intención segura→home de rol→logout→otro actor; todos los links profundos y volver/adelante.
J06: inventario→`/demo/user/mercadolibre` tabs Cuenta/Publicaciones/Stock/Actividad/Competencia→evento→alerta→producto comparado.

Cada E exige afirmaciones sobre datos antes/después además del click. Ninguna cantidad histórica de CTAs reemplaza estos escenarios.
