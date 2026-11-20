# Progreso

## 2026-11-14

- La auditoría confirmó que una única `BoundedAttemptWindow<RealmKey>` separa
  contadores, pero comparte `maxKeys` entre `CUSTOMER` y `USER`.
- El corte se limita a particionar capacidad y añadir regresiones; no modifica
  el contrato público de autenticación.
- Revisión de diseño GPT-6.1 Sol: usar una ventana por caso del enum cerrado y
  calcular capacidad hasta la expiración del último fallo vivo de cada clave.
- Implementación aplicada con regresiones de aislamiento bidireccional,
  saturación local, liberación exacta y `Retry-After` redondeado.
- Una primera expectativa temporal incorrecta fue detectada por las reviews y
  corregida antes del commit; el resultado fallido anterior no se usa como gate.
- Rerun focal fresco: `AttemptBudgetsTest` 13/13 y
  `LoginRateLimiterTest` 3/3 PASS.
- Suite backend completa fresca: 88 reportes, 439 tests, 0 failures,
  0 errors, 0 skipped. Al terminar no quedó proceso Java de la suite activo.
- Reviews GPT-6.1 Sol de bugs/contrato y seguridad: `APPROVE` exact-diff,
  sin hallazgos P0–P3 residuales.
- PR #275 fusionado como `86d01ac562b73c97678fa5999457c1a00b014fc0`.
  Verify exact-head `43559033106` y post-merge `43562771784` exitosos.
