# Technical spec

## CAP-01 Frontera

`mapCapability` traduce una sola vez los campos wire mediante `CapabilityModuleId.fromWire` y `CapabilityModuleState.fromWire`. Ambos traductores aceptan sólo el wire exacto; valores desconocidos, variantes de mayúsculas y espacios caen al singleton Unknown fijo. `CapabilityModule` mantiene esos objetos y configVersion (`number | null`); null significa ausente/inválida, sin inventar versión. Versiones deben ser enteros seguros positivos.

## CAP-02 Comando

`CapabilityChange` contiene módulo/estado cerrados. `ManageInstallationUseCase.setCapability` recibe la configuración actual y valida visibilidad, estado actual/destino y versión. Crea `CapabilityStateCommand` con `crypto.randomUUID()` una vez antes de llamar al repository, fuera de resuscripciones HTTP. El adapter serializa wires y los campos de concurrencia/idempotencia existentes; no cambia contrato backend, permisos ni razón por defecto.

`InstallationStore` toma la configuración del snapshot, usa exhaustMap para evitar POST superpuestos y defer para convertir errores síncronos de validación en el flujo de errores existente. En éxito actualiza la versión de la respuesta antes de recargar. La vista presenta etiquetas del tipo, compara objetos y bloquea Unknown o versión ausente.

## Verificación y límites

Tests enfocados: closed types, mapper, usecase (UUID/versión/retry), payload HTTP, vista y store (versión nueva, concurrencia, recuperación). Requiere validación frontend nativa en entorno con dependencias propias y dual Grok antes del merge. No hay migración, red ni activación. Rollback: revertir sólo este corte frontend y su WIP.
