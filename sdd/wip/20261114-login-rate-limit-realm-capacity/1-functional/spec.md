# Spec funcional

## Reglas

- Cada `IdentityRealm` posee su propio máximo de claves activas.
- Saturar un realm rechaza una clave nueva de ese mismo realm y no afecta al
  otro realm.
- Los buckets vencidos liberan capacidad después de la ventana real de 15
  minutos.
- Cinco fallos continúan bloqueando la misma identidad durante la ventana.
- Un login exitoso no borra evidencia de fallos.

## Fuera de alcance

No cambia credenciales, cookies, mensajes públicos, almacenamiento distribuido
ni la política de cinco intentos.
