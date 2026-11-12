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
- RD-006/007/007A cerrados: cola JDBC con leases/CAS y reaper por tandas,
  transporte SMTP TLS con timeout y frontera pre-DATA, keyring rotatable,
  métricas agregadas sin PII, HTTP con límites/CSRF y defaults productivos
  `UNCONFIGURED`/worker apagado. No se agregaron credenciales reales.
- RD-008 cerrado para CUSTOMER/USER: ownership, disponibilidad de lectura y
  solicitud son tipos cerrados separados; `/verify-email` limpia el fragmento
  antes de red, exige confirmación explícita y conserva el realm en sus CTA.
- RD-009 cerrado con evidencia local: backend 80 suites/399 tests, cero fallos;
  frontend arquitectura+lint+186 archivos/1225 tests y build productivo;
  Playwright Chromium 4/4 para ambos realms, Axe, secret cleanup y sesión del
  realm opuesto. Testcontainers y servidores temporales quedaron detenidos.
- RD-010 cerrado sobre `50b4794048bd64d20af47c30a9e971b9dea61bc2`:
  GPT-6.1 Sol Bugbot, Security y Producto/UX aprobaron sin P0-P2 ni P3 nuevos.
  Los P2 previos (IDNA y navegación cross-realm) y P3 (backlog del reaper y
  lectura unavailable) quedaron corregidos y cubiertos por pruebas.
- RD-011 cerrado: PR #250 fusionado con merge commit
  `5ba014f61387cdfed094fd4584d45a113ed605f8`. El CI exact-head
  `43231073607` quedó verde (backend, frontend/accesibilidad y matriz real) y
  las revisiones GPT-6.1 Sol Bugbot, Security y Producto/UX aprobaron
  `a9661689374acfdff607e5fa5efe419a0d3bd400` sin P0-P3.
- CI post-merge `43232058866` verde sobre `master@5ba014f`: backend 3m40s,
  frontend 3m44s y PostgreSQL/Spring/Angular HTTPS/browser real 6m05s. Los
  recursos temporales locales y contenedores fueron eliminados al finalizar.
- RD-EXT-01/02/03 siguen diferidos a homologación externa; no se los considera
  completados y los defaults productivos permanecen sin credenciales reales.
