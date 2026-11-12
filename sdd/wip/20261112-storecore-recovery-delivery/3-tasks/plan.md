# Plan de tareas

## Diseño y persistencia

- [x] RD-001 Revisar y aprobar specs funcional/técnico y threat model.
- [x] RD-002 V19 `email_version`, evidencia append-only, tokens, outbox con FKs
      exclusivas, payload secreto crypto-shreddable y delivery con `UNCERTAIN`.
- [x] RD-003 Tipos cerrados, keyring AES-GCM y mappers fail-closed.
- [x] RD-003A Constraints/FKs exclusivas y grafos CAS de token/delivery.
- [x] RD-003B Constraint trigger diferible token/outbox realm+sujeto.

## Backend

- [x] RD-004 Emisión, inspect no mutante y confirmación explícita con locks,
      budgets cuantificados y protección contra scanners.
- [x] RD-005 Enqueue recovery transaccional sólo para email verificado.
- [ ] RD-006 Worker SMTP TLS con lease, retry, uncertain terminal, revalidación,
      rotación, crypto-erasure y métricas sin PII.
- [x] RD-006A Frontera SMTP pre-DATA retry vs aceptación ambigua uncertain.
- [ ] RD-007 HTTP, CSRF, auditoría redacted y configuración deny-by-default.
- [ ] RD-007A Readiness independiente para verificación y recovery en cada modo.

## Frontend y evidencia

- [ ] RD-008 Ownership/request separados en `/customer/profile`, nueva
      `/user/account` y `/verify-email` accesible.
- [ ] RD-009 Unit, arquitectura, PG16, SMTP fake y browser real CUSTOMER/USER.
- [ ] RD-010 Reviews GPT-6.1 Sol Bugbot/Security/Producto exact-head.
- [ ] RD-011 PR, CI, merge autorizado y CI post-merge verde.

## Gate externo diferido

- [ ] RD-EXT-01 Credenciales, remitente, SPF/DKIM/DMARC y keyring productivo.
- [ ] RD-EXT-02 Homologación de entrega, observabilidad y runbook de incidentes.
- [ ] RD-EXT-03 Rollout `VERIFICATION_ONLY`, ADMIN verificado y habilitación
      explícita de `RECOVERY_ENABLED`.
