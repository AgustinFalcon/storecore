# Progreso

- 2026-11-12: auditoría coordinada GPT-6.1 Sol medium de backend/dominio,
  frontend/producto y seguridad/arquitectura, sin cambios de código.
- Se identificó emisión tardía de sesión desde candidatos/challenges verificados
  antes de un futuro reset; el plan la trata como prerrequisito, no como residual.
- Specs funcional/técnico y plan creados sobre `master 07670b0`.
- 2026-11-12: Corte A AR-001..004 implementado. V17 conserva challenges legacy
  sin autoridad, liga candidatos a versión, ordena scopes de identidad y alinea
  el helper SQL de capabilities sin editar migraciones publicadas.
- Gate backend final sobre el source exacto: Maven exit 0, 302 tests, 0 failures,
  0 errors, 0 skipped; log `backend/target/corte-a-full-final-test.log`.
- Reviews estáticas Bugbot y Security Review con GPT-6.1 Sol medium: sin P0-P3.
  Review exact-head, PR, CI, merge y Corte B/C: pendientes.
- 2026-11-12: Corte B AR-005..011 implementado con V18, token hash-only,
  delivery productivo `UNCONFIGURED`, capturador exclusivo de tests, budgets
  compuestos, inspect no mutante y complete transaccional por realm.
- Gate backend Corte B: Maven exit 0, 326 tests, 0 failures, 0 errors, 0 skipped;
  log `backend/target/corte-b-full-test.log`. Dos reviews estáticas sin P0-P3.
- Proveedor real, outbox, secretos y homologación siguen explícitamente NO-GO.
- 2026-11-12: Corte C AR-012..015/017 implementado sin commit. Dominio/pasos TS,
  HTTP estricto, `/recover`, `/reset-password`, limpieza de fragmento, accesibilidad,
  expiración/cooldown/incertidumbre e intención de login del realm recuperado.
- Gates frontend: `npm run verify` PASS (178 archivos/1190 tests), arquitectura,
  lint y build; `test:a11y` 79/79; recovery HTTP-boundary 12/12; check runner real PASS.
- Browser real UNCONFIGURED con PostgreSQL 16 efímero/Spring productivo/Angular
  HTTPS PASS 1/1 y SQL cero tokens. No capturador, provider ni debug HTTP.
- AR-016 permanece pendiente del journey browser exitoso con capturador privado
  exclusivamente de tests. Evidencia y límites en `corte-c-frontend-evidence.md`.
- Follow-up UX: intención login también ante incertidumbre/usado con otro realm
  vivo, expiración visible después de error de formulario y reinicio Unknown.
  Verify posterior PASS (178 archivos/1192 tests, arquitectura/lint/build) y
  recovery browser 16/16. Sin commit/push; AR-016 permanece pendiente.
