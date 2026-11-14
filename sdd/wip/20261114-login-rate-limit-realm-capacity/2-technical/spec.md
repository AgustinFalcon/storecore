# Spec técnico

`IdentityRealm` es el conjunto cerrado que selecciona una instancia
`BoundedAttemptWindow<AuthenticationBudgetKey>`. Cada instancia recibe el mismo
reloj, límite de fallos y `maxKeys`, pero conserva capacidad y buckets propios.

El email continúa representado exclusivamente por su SHA-256 canónico. No se
agregan strings de realm ni branching abierto. Los tests usan reloj mutable y
capacidad mínima para probar saturación cruzada, saturación local y liberación
por expiración.

La solución mantiene una responsabilidad por clase: `LoginRateLimiter` enruta
al presupuesto cerrado; `BoundedAttemptWindow` conserva la semántica temporal
y de capacidad de una sola partición.
