# Login realm budget — hallazgos Astra y disposición Sol

**Fecha:** 2026-09-27 · **Resultado:** `NO-GO` para código nuevo hasta revisión del delta SDD.

Esta disposición registra los hallazgos Astra transmitidos para el slice y cómo se incorporaron al WIP `sdd/wip/20260927-login-realm-budget/`. No declara una segunda revisión ni aprobación de código. El baseline archivado conserva su contrato general de cinco fallos por 15 minutos.

## MUST incorporados

1. El `Retry-After` de saturación usa el último fallo del bucket que libera primero una plaza en ese realm. Difiere del umbral de cinco, que usa el fallo en posición `n - 5` entre `n >= 5` fallos vigentes. Con exactamente cinco es el primero; con seis o más, calculados tras intentos en vuelo, el primero puede vencer y dejar la clave todavía bloqueada.
2. El contrato declara 10 000 claves activas por realm, fail-closed para nuevas claves incluso con credenciales correctas, sin desalojo de buckets activos, y recuperación por `clear` o expiración. El límite es por proceso, no global.
3. Las pruebas pendientes distinguen ambos relojes con fallos escalonados, dos buckets para el mínimo de capacidad, intercalación determinista de cuatro fallos más dos intentos en vuelo, bordes `expiry - 1 ms`/`expiry` y redondeo, `clear` por realm y lectura del primer HTTP 429 con cliente que no reintenta, tiene timeout explícito y no espera el header.

## SHOULD trazados por separado

- El monitor sincronizado compartido puede provocar contención entre realms; medir antes de prometer aislamiento de rendimiento.
- El número de buckets tiene cota, pero la deque de fallos por bucket no tiene cota absoluta: también puede crecer con intentos concurrentes que pasaron `checkAllowed` antes de registrar el fallo. Requiere diseño y prueba aparte.

## Gate y evidencia

`TASK-LRB-001` pide revisión independiente de este delta y decisión escrita. `TASK-LRB-002` y siguientes permanecían pendientes hasta ese gate. La suite local anterior de 116 tests no verificaba la corrección propuesta de fallos escalonados. Aún faltan dos revisiones de código independientes y CI remoto ejecutado para los gates posteriores.
