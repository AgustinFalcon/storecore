# Segunda entrega comercial — 2026-10-09

Scope autorizado: completar procesos frontend simulados y responsive antes de retomar backend. Baseline `0f703e52`. La entrada `/demo` conserva aislamiento de HTTP/auth productivos y expresa simulación en pagos, envíos, ML y competencia.

Checkout incorpora métodos tarjeta, QR y transferencia, procesamiento visible, aprobación/pendiente/rechazo y cancelar/reintentar. Solo aprobación consume onHand; pendiente mantiene reserva hasta resolución/cancelación. Envío/retiro capturan destino, costo y plazo al comprar; historial/tracking/incidencias son reproducibles sin proveedor real. Comprobante descargable/imprimible es DEMO, no fiscal.

Mercado Libre incorpora tabs Cuenta/Publicaciones/Stock/Actividad/Competencia. Cada cambio local proyecta stock deseado en cola identificada; observed/confirmed cambian al procesarla explícitamente. La venta simulada usa operation id y dedupe. Watchlist configura umbral, historial y alertas de muestra sin scraping. Tipos cerrados traducen wire y Unknown bloquea acciones.

Cuenta tiene navegación persistente. Administración mobile presenta cards con acciones legibles y menú completo. Assets locales diferenciados por producto y relacionados excluyen el producto actual y archivados.

Aceptación: unitarias de snapshot/transiciones/idempotencia, browser procesos de pago/envío/ML/competencia y keyboard/responsive; regresiones previas y builds demo/productivo. Reviews independientes sobre SHA final. No se declara integración ML live ni homologación completada.
