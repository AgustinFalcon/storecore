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
