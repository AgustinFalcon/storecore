# Contrato técnico

## Baseline inspeccionado

En `db377fa`, `frontend/src/app/demo/demo-model.ts` contiene `DemoProductVariant.Standard/Case`, `DemoGalleryView.Front/Detail`, `DemoProduct` con stock por producto y `DemoOrder.returned: boolean`; estos modelos justifican precisar inventario por variante, galería y postventa. `demo-screen.ts` declara 24 rutas. Esto es inspección estática, no evidencia de ejecución nueva ni afirmación de que cada recorrido actual falla.

Auditoría holística comunicada por el coordinador de esta entrega: identidad del catálogo demo por SKU y no variante; agregar impide dos presentaciones del mismo SKU; imágenes de altas nuevas usan el asset fijo `DEMO-010`; RMA limitado a `returned`/inspección, sin solicitud/decisión/reembolso; shipping avanza igual en ambas modalidades; alertas derivadas sin inbox ni preferencias; login demo permite email duplicado/cualquier password por diseño. Estos hallazgos motivan los cortes y deben reproducirse/cerrarse con evidencia en su implementación. En el runtime real de ML existen mapping/inbox/outbox parciales, pero faltan OAuth y dispatcher; no trasladar la apariencia de conexión demo a una afirmación de integración real.

## Diseño de los cortes

Mantener `main.demo.ts`/composición demo aislada del runtime HTTP real. Dominio framework-free, coordinadores de caso de uso y repositorio de snapshot local; la vista renderiza y emite intenciones. Evitar concentrar nuevos flujos en el componente monolítico: catálogo/galería, carrito, postventa, fulfillment, identidad y marketplace tienen responsabilidades separadas.

Estados finitos (pago, postventa, modalidad, fase de entrega/retiro, recuperación, sync, alerta, pestaña y filtro finito) se modelan por clase TS con constructor privado, instancias estáticas, etiquetas/reglas y único `fromWire` con `Unknown`. Reusar tipos existentes donde la semántica coincida. SKU, ID de variante, nombre de marca, categoría editable o identificador de pedido son datos abiertos, no enums. No confundir la antigua selección cerrada Standard/Case con un catálogo abierto de variantes creadas por el administrador. Los DTO y snapshots pasan por un único traductor; vista/store/tests usan tipos, sin strings mágicos de estado. Unknown bloquea escrituras y muestra recuperación útil.

FE-COMP-02 introduce identidad de variante estable separada de SKU de producto, atributos y medios; línea de carrito por variantId, stock y reserva por variante. Pedido conserva snapshot inmutable de nombre/atributos/precio/descuento/moneda/cantidad. Índices o labels no son identidad. Media local validada, fallback y alt; no ejecutar URLs arbitrarias ni introducir llamadas remotas para el demo.

FE-COMP-03 usa solicitudes y líneas de devolución con cantidad, motivo, decisión, recepción, disposición y operación de reembolso simulada. Invariantes: cantidad retornada acumulada <= comprada; reembolso acumulado <= importe efectivamente pagado; stock solo retorna una vez tras inspección apta. Política determinista de reparto de descuento/redondeo en centavos, residuo asignado de forma estable. Eliminar `returned` como autoridad sin perder lectura legacy. Cada paso es objeto de responsabilidad única; un orquestador los ordena.

FE-COMP-04 separa política HomeDelivery/Pickup y transiciones elegibles. Evento de incidencia no sustituye el estado de entrega. Alertas derivan de eventos con identidad, fecha, recurso destino y estado de lectura/resolución; operación y evento deduplicables. Separar reglas de habilitación de presentación. No duplicar reglas distintas en admin/comprador.

FE-COMP-05 usa contexto e intención tipados; IDs dinámicos se validan contra ownership del actor actual. Nunca aceptar URL externa/arbitraria. Recovery demo no integra correo ni modifica auth real. Formularios con errores por campo, resumen/foco y confirmación de abandono cuando corresponde; contadores y listas derivan de la misma selección.

FE-COMP-06 conserva mapping explícito y valores desired/observed/confirmed separados. Simulador expone inputs/eventos, persistencia, dedupe y fallos deterministas. Fuente competidora configurada como fixture local, read-only y con frescura. No claims OAuth activo, sincronización live ni cambio remoto efectivo.

Snapshot: incrementar versión al cambiar esquema, migración validada y atómica con fixture legacy. Si no puede migrarse, mensaje y reset confirmado; no sobrescribir silenciosamente datos inválidos. Actualizaciones serializadas/idempotentes y reconciliación de revisiones evitan pérdida por tabs; definir política observable para conflicto antes de persistir. Reset restaura fixtures demo solamente.

## Backend y homologación

Backend FE04 estacionado conserva su evidencia en `../20261008-integration-frontend-process/4-implementation/int-fe04-backend-local-evidence.md` en el worktree backend; el archivo puede no estar en esta rama. No copiar una declaración de PASS desde él. La implementación real futura debe validar elegibilidad en servidor, auth/CSRF/ownership, dinero/stock transaccional, reembolsos durable/idempotentes y auditoría.

Pagos/envíos reales requieren contratos de proveedor y credenciales sandbox, firma/refetch/notificaciones, reintentos y evidencia del entorno. ML requiere OAuth server-side, tokens fuera del frontend, seller autorizado, callback/webhooks y dispatcher remoto; proyección local no acredita despacho remoto. Competencia requiere fuente permitida/licenciada. Fiscal externo y BlackStore live siguen sus carriles. Este WIP no activa providers ni modifica migraciones/contratos reales.
