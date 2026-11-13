# Especificación funcional — disponibilidad fiscal sin activación

## Objetivo

Actualizar la fuente de verdad de StoreCore después de validar la biblioteca
ARCA externa, sin confundir disponibilidad técnica con una decisión fiscal ni
con homologación.

## Resultado observable

- StoreCore reconoce `0.1.0-RC.4` como candidato técnico verificable.
- El flujo futuro conserva un único traductor desde wire y usa tipos cerrados
  para estados, resultados de emisión y resultados de conciliación.
- Un pago, redirect, webhook, QR o PDF nunca acredita por sí mismo una emisión.
- Un resultado incierto obliga a conciliar antes de reintentar.
- La aplicación permanece sin adapter fiscal activo hasta que titular, contador,
  producto, plataforma y seguridad aprueben sus decisiones correspondientes.

## Fuera de alcance

- Elegir emisor, punto de venta, condición IVA o tipo de comprobante.
- Definir la matriz receptor/comprobante o la política de NC/ND.
- Incorporar CUIT, certificados, claves, tokens o datos personales reales.
- Agregar DDL, scheduler, worker, endpoint o dependencia runtime a StoreCore.
- Declarar homologación, release o producción.

## Criterios de aceptación

1. La documentación canónica distingue biblioteca validada, adapter pendiente y
   homologación externa pendiente.
2. Cada gate abierto tiene dueño, entrada exigida y evidencia de salida.
3. No se copia ningún secreto ni se infiere una decisión del comercio.
4. El backlog deja de afirmar que falta una biblioteca auditable, pero conserva
   el adapter StoreCore bloqueado por decisiones externas explícitas.
