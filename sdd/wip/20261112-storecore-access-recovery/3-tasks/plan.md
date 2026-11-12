# Plan de tareas

## Corte A — coherencia de credenciales

- [x] AR-001 V17: versiones de credencial; challenge versionado nuevo y legacy
      `LEGACY_UNVERIFIABLE` sin reescribir evidencia; trigger V11 actualizado.
- [x] AR-002 Candidatos/login/unificado ligados a versión; subject lock primero
      mediante `IdentityMutationScope` ordenado en coordinator/login/issue;
      preflight+revalidación para comandos admin multi-sujeto, sin debilitar CSRF.
- [x] AR-003 Cambio de email incrementa versión e invalida candidatos/challenges
      pendientes del CUSTOMER sin mezclar realms (tokens se agregan en B).
- [x] AR-004 Upgrade con challenges legacy y carreras deterministas de login,
      challenge, perfil/email+CSRF, admins cruzados y suspensión/reset, incluyendo
      actor revocado durante espera, sin deadlock ni efectos no autorizados.

## Corte B — core recovery local fail-closed

- [x] AR-005 Tipos cerrados, política de contraseña compartida y puertos.
- [x] AR-006 V18: persistencia hash-only, TTL, estados terminales y locks.
- [x] AR-007 Request neutral + delivery `UNCONFIGURED` + capturador sólo test.
- [x] AR-008 Inspect no mutante y complete atómico/single-use.
- [x] AR-009 Revocación SYSTEM del realm, auditoría y supersesión de tokens hermanos.
- [x] AR-010 Budgets atómicos IP+instancia previos al lookup, presupuestos por
      destino/hash, saturación de cardinalidad y límites de tokens vivos.
- [x] AR-011 HTTP, migración, concurrencia, rollback y seguridad PostgreSQL 16.

## Corte C — frontend y evidencia de punta a punta

- [ ] AR-012 Dominio TS cerrado, repository, mapper y use cases.
- [ ] AR-013 `/recover`, enlace desde login y experiencia neutral accesible.
- [ ] AR-014 `/reset-password`, fragmento realm+token, secreto en memoria, inspect,
      complete e intención `AuthenticateRecoveredRealm` sin cerrar el otro realm.
- [ ] AR-015 Unit, mapper, store, focus/ARIA/axe/teclado, Unknown sin probes,
      cooldown, expiración y regresiones de ruta/doble submit/respuesta perdida.
- [ ] AR-016 E2E real con PostgreSQL/Spring/Angular HTTPS y capturador fake.
- [ ] AR-017 Actualizar PSD SC-SURF-03 como core local completo/email externo bloqueado.

## Gates de entrega

- [ ] AR-018 Gates locales completos por corte.
- [ ] AR-019 Dos reviews independientes GPT-6.1 Sol medium sobre cada SHA final.
- [ ] AR-020 PR/CI exact-head, merge autorizado y CI post-merge verde.

## Diferido explícito

- [ ] AR-EXT-01 Proveedor y outbox cifrado, remitente, credenciales y homologación.
- [ ] AR-EXT-02 Política/evidencia de email verificado antes de activar recovery real.
