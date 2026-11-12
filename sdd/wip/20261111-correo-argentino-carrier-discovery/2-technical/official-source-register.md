# Registro de fuentes oficiales — Correo Argentino

**Consulta:** 2026-11-11. Sólo se consideran fuentes del dominio oficial de
Correo Argentino. Los ejemplos de manual no son credenciales ni evidencia de
una cuenta habilitada.

| Fuente | Fecha/versión visible | Capacidad acreditada | Límite observado |
| --- | --- | --- | --- |
| [API MiCorreo](https://www.correoargentino.com.ar/MiCorreo/public/img/pag/apiMiCorreo.pdf) | 2025-01-14, 18 páginas | JWT, sucursales, cotización, importación y tracking; QA/PROD públicas | Import responde sólo `createdAt`; tracking requiere `shippingId`, usa GET con body y contiene un typo de ruta/estructuras 200 ambiguas. Sin rótulo/cancelación/webhook/idempotency key/rate limit cuantificado. |
| [PAQ.AR API 2.0](https://www.correoargentino.com.ar/MiCorreo/public/img/pag/apiPaqAr-v2.pdf) | Abril 2023; historial 1.0–1.2, labels menciona cambios 1.3 y `labelFormat` 1.13 | agreement/API key, alta, cancelación, rótulo, tracking y sucursales; QA/PROD públicas | El versionado interno no coincide con el historial. Sin cotización/webhook/idempotencia/rate limit documentados; `shipmentClientId` figura no funcional y sólo se procesa el primer `parcel` en la versión publicada. |
| [FAQ MiCorreo](https://www.correoargentino.com.ar/MiCorreo/public/faqs) | vigente al 2026-11-11 | alta de cuenta, credenciales mediante ejecutivo comercial, integración sin costo fijo y pago por envío | Operación/alcance/pesos pueden variar por servicio y acuerdo. |
| [Paquetería eCommerce PAQ.AR](https://www.correoargentino.com.ar/servicios/paqueteria/paqueteria-ecommerce-0) | vigente al 2026-11-11 | Clásico/Expreso, tracking, pickup opcional, avisos y devoluciones como oferta comercial | No define el wire/API ni reemplaza homologación contractual. |
| [Términos de Integraciones](https://integracion.correoargentino.com.ar/terms) | vigente al 2026-11-11 | acuerdo comercial, cuenta corriente, carga/etiqueta/seguimiento y responsabilidad del titular | Tarifas y condiciones pueden cambiar; no es contrato técnico suficiente. |

## Hallazgos que obligan validación comercial

- Las fuentes públicas muestran límites de peso/medidas diferentes según
  producto/canal; StoreCore no fija un máximo global. Consume la elegibilidad
  del servicio habilitado y conserva la regla/version probada.
- Una sucursal puede no estar habilitada para un agreement específico.
- “Trazabilidad” significa historial de eventos, no ubicación GPS en vivo.
- Los manuales revisados no acreditan webhook. El diseño inicial usa polling
  acotado y sólo cambiará mediante addendum oficial fechado.
- Una etiqueta o preimposición no acredita admisión física ni entrega.
- Una respuesta HTTP 200 puede contener eventos vacíos o un resultado de error
  por ítem; la semántica se valida completa antes de producir un hecho local.
