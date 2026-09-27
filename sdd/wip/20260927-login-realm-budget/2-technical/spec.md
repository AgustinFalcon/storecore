# Technical spec — presupuesto de login por realm

**Estado:** `ready_for_implementation`. GO documental Astra r2 registrado en `sdd/reviews/20260927-login-realm-budget-astra-r2-go.md`. Implementación de TASK-LRB-002/003 y pruebas locales completas: 29 suites, 126 tests sin fallos; dos GO independientes de código para preparar PR, con cierre del PR aún pendiente.

## Estado y operaciones

`LoginRateLimiter` mantiene mapas separados por `IdentityRealm`, con máximo por defecto de 10 000 buckets por mapa. Cada clave contiene `realm|sourceIp|SHA-256(canonicalEmail)`; nunca email crudo. `checkAllowed` se ejecuta antes de verificar contraseña; `recordFailure` agrega el fallo y `clear` retira sólo la clave del realm indicado tras login exitoso. La sincronización es local al objeto/proceso.

Un fallo en tiempo `t` sigue vigente mientras `now - t < 15 min`; vence si `now - t >= 15 min`. El barrido de expirados de cada clave nueva puede ser O(n) sobre todos los buckets de ese realm, incluso antes de llegar al cupo, tanto en `checkAllowed` como en `recordFailure`. No se expulsa un bucket con fallos vigentes. `checkAllowed` y `recordFailure` son operaciones separadas: varios intentos pueden superar juntos el umbral antes de registrar sus fallos. La respuesta siguiente debe respetar el número real de fallos vigentes.

## Dos cálculos de Retry-After

1. **Umbral de cinco por clave:** ordenar los `n` fallos vigentes cronológicamente. Si `n >= 5`, la clave baja de cinco cuando vence el fallo con índice `n - 5`, el más antiguo de los cinco más recientes: `max(1, ceil((failures[n - 5] + 15 min - now) / 1 s))`. El primer fallo vigente sólo sirve cuando `n = 5`. Por ejemplo, con cuatro fallos previos y dos intentos simultáneos que pasan `checkAllowed` antes de llamar a `recordFailure`, quedan seis: vencer el primero deja cinco, y el bloqueo continúa.
2. **Capacidad del realm:** una plaza se libera cuando se retira todo un bucket. Cada bucket activo vence en `lastFailure + 15 min`; tomar el mínimo de esos vencimientos dentro del realm saturado. `max(1, ceil((minExpiry - now) / 1 s))`. Antes de rechazar, podar los buckets de ese realm que ya estén vacíos. Un fallo concurrente puede mover el vencimiento.

Ejemplo: capacidad 1; fallos de una clave en `t=0` y `t=5 min`. En `t=5 min`, el primer fallo vence dentro de 10 minutos, pero la plaza no se libera hasta dentro de 15 minutos (`t=20 min`). El cálculo por primer fallo sería incorrecto para saturación.

Ambos rechazos se traducen a `429 AUTH_RATE_LIMITED`, `Retry-After` entero positivo, `Cache-Control: no-store` y cuerpo público genérico. La capacidad se decide antes de saber si las credenciales son correctas.

## Pruebas exigidas

- Reloj mutable con fallos escalonados y seis vigentes por intercalación determinista de cuatro previos más dos intentos en vuelo: bloqueo usa el fallo `n - 5`, no siempre el primero; al vencer el primero con seis, aún responde `429`. Verificar que el header nunca anuncia liberación temprana.
- Dos buckets activos del mismo realm, cada uno con fallos escalonados: la capacidad usa el menor de sus vencimientos por **último** fallo, independientemente del orden de inserción o de cuál tuvo el primer fallo más antiguo.
- Bordes temporales deterministas en `expiry - 1 ms` y `expiry`, tanto para umbral como para capacidad; verificar el redondeo hacia arriba a segundos (incluido un remanente de 1 ms) y el mínimo positivo de 1. Probar USER y CUSTOMER.
- Cupo pequeño inyectado: saturación en ambos sentidos sin interferencia; buckets preexistentes intactos; denegación de clave nueva incluso para credenciales válidas antes de verificarlas; admisión tras `clear` del realm correcto y tras expiración.
- HTTP: primer `429` y `Retry-After` visibles con cliente sin reintento automático y timeout explícito, sin dormir la ventana real.

## SHOULD y seguimiento separado

- El monitor sincronizado compartido por ambos realms puede serializar logins; medir contención antes de particionar locks. No afirmar aislamiento de rendimiento.
- Los buckets tienen cota; la `ArrayDeque` de fallos por bucket no tiene cota absoluta. También puede crecer por llamadas concurrentes que ya pasaron `checkAllowed` antes de `recordFailure`, además de llamadas directas fuera del flujo normal. Diseñar y probar una cota aparte sin alterar el umbral ni los tiempos; no asumir que el chequeo previo limita por sí solo la deque a cinco.
- Los 10 000 buckets son por instancia. Enforcement global para varias réplicas exige otro diseño, fuera de este delta.
