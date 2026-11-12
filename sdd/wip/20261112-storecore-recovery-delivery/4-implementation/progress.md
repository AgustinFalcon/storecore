# Progreso

## 2026-11-12

- SDD inicial creado desde `master@b0dc0fe`.
- Estado `draft_for_review`; no hay código, migración, credencial ni activación.
- El default productivo permanece `UNCONFIGURED`.
- Primera revisión coordinada arquitectura/seguridad y producto/UX: `NO-GO`.
  Se corrigieron `email_version`, scanner-safe confirm, crypto-erasure,
  `UNCERTAIN`, configuración SMTP estricta, presupuestos, `/user/account` y
  rollout histórico. Revisión R2 pendiente; código aún no iniciado.
- R2 cerró la mayoría de hallazgos y mantuvo NO-GO por seis residuos. Se
  corrigieron la mención a credential version, FKs exclusivas de sujeto/token,
  grafos CAS, readiness por capability y alcance externo del runbook. R3 pendiente.
- R3 cerró los residuos R2 y encontró dos contradicciones finales: integridad
  cruzada imposible mediante CHECK y timeout SMTP ambiguo. Se corrigieron con
  constraint trigger diferible y frontera pre-DATA/aceptación incierta. R4 pendiente.
- R4 coordinada GPT-6.1 Sol arquitectura/seguridad + producto/UX: `APPROVE`, sin
  P0-P2. RD-001 cerrado; se autoriza iniciar RD-002/003 sin activar SMTP.
- RD-002/003/003A/003B implementados sin activar SMTP: migración V19 con
  `email_version`, evidencia append-only, tokens, outbox/secret/delivery,
  constraint triggers diferibles, grafos terminales y crypto-shredding; tipos
  cerrados fail-closed y envelope encryption AES-256-GCM con keyring rotatable.
- Regresión combinada verde: 9 pruebas de dominio/cifrado, 9 pruebas focales de
  migración PostgreSQL 16 y `RecoveryHttpIntegrationTest`; Flyway termina en
  V19 y el histórico previo se conserva. El error de auditoría que aparece en
  logs es un fallo inyectado y esperado por el test de atomicidad.
- RD-004/005 y la frontera RD-006A implementados: verificación hash-only con
  inspect no mutante y confirmación explícita single-use; recovery sólo crea
  autorización/outbox/secreto cifrado para evidencia de ownership vigente;
  worker aislado con handoff durable, retry exclusivamente pre-DATA y estado
  terminal `UNCERTAIN` ante aceptación ambigua o crash posterior al marcador.
- Se extendió V19 antes de publicación con `handoff_started_at` y categorías de
  error cerradas. Un retry probado pre-DATA limpia el marcador mediante CAS;
  un lease abandonado con marcador jamás autoriza reenvío automático.
- Matriz integrada verde: 61 pruebas (dominio, budgets, crypto, worker,
  verificación/recovery PostgreSQL 16 y HTTP). Los fixtures antiguos ahora
  generan evidencia de verificación real y el cambio de email exige verificar
  la nueva versión antes de volver a emitir recovery.
