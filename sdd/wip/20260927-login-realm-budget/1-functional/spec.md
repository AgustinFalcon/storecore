# Functional spec — presupuesto de login por realm

**Estado:** `ready_for_implementation`. GO documental Astra r2 registrado en `sdd/reviews/20260927-login-realm-budget-astra-r2-go.md`. Base: identidad del core archivado.

## Comportamiento observable

- `LRB-AC-01`: USER y CUSTOMER tienen presupuestos independientes de hasta 10 000 claves activas cada uno. Saturar uno no impide que el otro acepte una clave nueva. La clave identifica realm, IP de origen y hash del email canónico; el email crudo no queda en el bucket.
- `LRB-AC-02`: una clave existente recibe `429 AUTH_RATE_LIMITED` con cinco o más fallos vigentes en una ventana móvil de 15 minutos. Si hay `n >= 5`, su `Retry-After` indica cuándo vence el fallo en posición `n - 5` (índice de base cero, orden cronológico): el más antiguo de los cinco fallos más recientes. Con exactamente cinco, coincide con el primero vigente; con seis o más, vencer sólo el primero puede dejarla bloqueada. Se redondea hacia arriba a segundos y nunca es inferior a 1.
- `LRB-AC-03`: con 10 000 claves activas, una clave nueva del mismo realm recibe `429 AUTH_RATE_LIMITED` antes de verificar credenciales, incluso si la contraseña sería correcta. No se desaloja una clave activa. Las claves existentes conservan su comportamiento.
- `LRB-AC-04`: en saturación, `Retry-After` indica el tiempo hasta que algún bucket completo del realm pueda retirarse. Se calcula con el último fallo del bucket que primero quedará vacío, no con el primer fallo que sólo baja su contador. Es consejo HTTP, no promesa ante fallos concurrentes que prolonguen una clave.
- `LRB-AC-05`: un login correcto limpia sólo su clave y realm; también se recupera capacidad al vencer el último fallo de un bucket. En el instante exacto de 15 minutos ese fallo ya no ocupa capacidad. El otro realm permanece intacto.
- `LRB-AC-06`: los dos motivos de `429` conservan la misma respuesta pública genérica, sin revelar existencia de cuenta o validez de contraseña. El cliente recibe el primer `429` con su header; los tests usan timeout explícito, no reintentan ni esperan 900 segundos.

## Límite de producto

El presupuesto reside en memoria de cada proceso: no coordina réplicas ni sobrevive reinicios. No se presenta como cupo global o defensa distribuida. Este delta no cambia sesiones, CSRF, roles ni el contrato de login del baseline.
