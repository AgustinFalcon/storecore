# Spec funcional

## Problema

La pantalla productiva de resultado relee la orden al entrar y permite reintento
cuando la lectura falla, pero una orden `PENDING` visible no ofrece una acción
explícita para volver a consultar la autoridad. CUSTOMER debe abandonar la
pantalla o recargar el navegador para observar una acreditación posterior.

## Comportamiento

- Una orden con pago pendiente muestra `Actualizar estado`.
- La acción realiza una nueva lectura autoritativa de esa misma orden.
- Durante la lectura se conserva el último snapshot visible y se bloquean
  activaciones duplicadas.
- Éxito, fallo, actividad e incertidumbre son estados cerrados; la vista no
  compara textos ni wires.
- Si la respuesta cambia a acreditada, rechazada o cancelada, la pantalla usa el
  nuevo `PaymentStatus` y deja de ofrecer actualización de pago pendiente.
- Un fallo conserva el snapshot previo, informa recuperación y permite reintento.
- Una ruta nueva cancela la lectura anterior; una respuesta tardía nunca puede
  reemplazar la orden de la ruta vigente.
- `Unknown` falla cerrado y no habilita actualización.

## Accesibilidad

- El botón expone su estado ocupado y queda deshabilitado durante la lectura.
- El resultado de la actualización se anuncia mediante una región `aria-live`.
- Los enlaces existentes a detalle y catálogo permanecen disponibles.

## Fuera de alcance

Polling automático, temporizadores, acreditación desde parámetros de retorno,
webhooks, Mercado Pago live, QR, facturación, cambios de stock, emails, base de
datos, secretos, deploy y homologación.
