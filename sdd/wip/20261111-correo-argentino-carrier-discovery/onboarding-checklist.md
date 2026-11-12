# Checklist de onboarding y homologación — Correo Argentino

El equipo guía al cliente; el titular sólo aporta/autoriza lo que legal o
comercialmente debe estar a su nombre. No pegar secretos en formularios, chat,
issues ni repositorio.

## Datos a solicitar al titular

- Razón social, CUIT, condición fiscal y contacto autorizado.
- Cuenta MiCorreo activa/verificada e identificador de cliente saneado.
- Acuerdo comercial PAQ.AR si aplica, servicios/modalidades contratados y
  condiciones de facturación/pago.
- Domicilio/s de origen, responsable de despacho y modalidad de
  admisión/pickup.
- Catálogo de tipos de mercadería, pesos/medidas reales, valor declarado,
  restricciones y volumen esperado.
- Política comercial de costo de envío: trasladado, subsidiado o umbral; nunca
  modificar la tarifa oficial sin mostrar el snapshot resultante.
- Contactos de soporte/reclamos y responsables de homologación/producción.

## A solicitar a Correo Argentino

- Confirmación escrita de API/producto, versión de manual y endpoints vigentes.
- Credenciales QA y luego PROD entregadas por canal seguro al titular; StoreCore
  recibe únicamente referencias de secret store.
- Agreement/customer/seller ids y servicios/sucursales habilitados.
- Catálogo de servicios, modalidades, eventos, errores y límites.
- Reglas de idempotencia, consulta posterior, timeout, rate limit y retry.
- Capacidad y formato de cotización, alta/import, correlación de `shippingId` o
  tracking, uno/múltiples bultos, rótulo, tracking y
  cancelación/rescate/devolución.
- SLA, ventana de mantenimiento, soporte técnico y procedimiento de incidente.

## Evidencia de homologación

- Autenticación válida e inválida sin revelar secreto.
- Domicilio y sucursal; servicio no habilitado; CP/dimensión/peso inválidos.
- Cotización fresca/vencida y divergencia de tarifa.
- Alta exitosa, replay, doble clic, respuesta perdida y conciliación.
- Rótulo válido/inválido/sobredimensionado cuando corresponda.
- Tracking conocido, sin eventos, desconocido y código futuro `Unknown`.
- Cancelación antes de imposición y rechazo después de imposición.
- 401/403/409/429/5xx, timeout y recuperación.
- Verificación de redacción/PII, auditoría, kill switch, rollback e instalación
  limpia/upgrade.

La homologación termina con `CARRIERS=DISABLED`; activar producción es un gate
separado y explícito.
