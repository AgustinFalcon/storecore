# Progreso — identidad histórica del comprador

## 2026-11-13

- Auditoría backend: el único hueco productivo es la captura de `name/email` en
  `JdbcCartService`; JSONB, trigger inmutable y proyección ya existen.
- Auditoría de contrato: DTO, mapper, tipos cerrados y UI ya soportan hechos
  históricos conocidos y no disponibles sin imprimir wire crudo.
- Decisión: cambio prospectivo, sin migración ni backfill.
- Review coordinada: NO-GO menor por ubicación de captura, error estable y prueba de
  carrera perfil/checkout; las tres precisiones fueron incorporadas.
- Estado: specs aprobados, implementación habilitada.
- Implementación: `BuyerSnapshotIdentity` valida email con la autoridad
  `CanonicalEmail`, exige representación exacta y compone el nombre histórico.
- Checkout captura identidad después de resolver replay y antes de dirección,
  inventario, claim o reserva. Corrupción devuelve 409
  `CUSTOMER_IDENTITY_UNAVAILABLE` sin efectos.
- Cobertura: valores exactos en los cuatro endpoints, snapshot inmutable tras edición
  y replay, nueva orden con identidad nueva, corrupción fail-closed y carrera real
  observada sobre advisory lock CUSTOMER con tuplas completas anterior/posterior.
- Tests focales definitivos: 26/26 (`BuyerSnapshotIdentityTest` y
  `CommerceHttpIntegrationTest`).
- Reviews coordinadas código/seguridad GPT-6.1 Sol: `APPROVE`, sin P0–P3.
- Suite backend completa: `mvn -q test`, exit 0.
- Gate frontend completo: arquitectura, lint, 194 archivos / 1303 tests y build,
  exit 0. La primera ejecución aislada falló por permisos de lectura del sandbox;
  la repetición fuera del sandbox confirmó que no era un defecto del código.
- Estado: listo para commit, PR y CI.
