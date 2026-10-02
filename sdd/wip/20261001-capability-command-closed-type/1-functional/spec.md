# Functional spec

## CAP-01 Lectura fiel

La consola usa objetos cerrados para identificar y etiquetar módulos y estados. Un módulo desconocido se omite; un estado desconocido se muestra como no reconocido y no se confunde con apagado. Falta de versión válida impide escribir y pide recargar.

## CAP-02 Intento de cambio

El operador elige un estado tipado. El store busca la configuración más reciente que posee para ese módulo. Un intento incluye UUID de correlación y esa versión. Resuscribir o reintentar el transporte conserva el mismo UUID y versión; una nueva acción genera otro UUID. Intentos simultáneos durante un POST se omiten. La respuesta conserva la nueva versión antes de recargar la lista.

## Aceptación

- Known module/state son singletons y tienen etiquetas propias.
- Unknown no guarda ni imprime el wire desconocido; no genera comandos.
- El POST incluye state canónico, correlationId UUID y expectedConfigVersion positiva.
- Una respuesta/version faltante nunca habilita el fallback de versión cero del backend.
- No se habilita automáticamente ningún módulo ni se reintenta un conflicto como un intento nuevo.
