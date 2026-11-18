# Plan de implementación

## Corte A — dominio y persistencia

- [x] TASK-001 Tipos cerrados, value objects y pasos del flujo.
- [x] TASK-002 Migración forward-only en el próximo número libre (V27 sobre la
  base aprobada `41948a6`; recalcular contra `master`) compatible con todas las
  filas legales de V1, sin reutilizar migraciones publicadas.
- [ ] TASK-003 Repositorios, CAS, ownership, lease/fencing y workers (en
  progreso: upload/delete durable, composición CAS y expiración/limpieza
  durable integrados; alta atómica en implementación).
- [x] TASK-004 Puerto privado y adapter determinista de prueba.

## Corte B — seguridad y API

- [ ] TASK-005 Inspección/normalización segura con ADR de librería.
- [ ] TASK-006 Filtro multipart, cuotas y límites de recursos.
- [ ] TASK-007 API drafts/uploads/recovery/preview/delete/composition/delivery.
- [ ] TASK-008 Compatibilidad de catálogo, alta atómica y lectores existentes.

### Subcorte aprobado — alta atómica local

- [x] MEDIA-CREATE-001 Definir comando create-only, referencias de variante de
  cliente, resultado cerrado y hash canónico versionado.
- [x] MEDIA-CREATE-002 Agregar ledger V30 de idempotencia por draft con
  ownership compuesto, snapshot durable y privilegios runtime mínimos.
- [x] MEDIA-CREATE-003 Implementar una única transacción local para producto,
  variantes, stock inicial, claim de draft, asociaciones, auditoría y receipt.
- [ ] MEDIA-CREATE-004 Cubrir replay, hash distinto, ownership/TTL/estado,
  rollback, colisiones, carreras con cleanup y upgrade V29→V30.

El subcorte no agrega HTTP, decoder, proveedor live, secretos, deploy ni
homologación. TASK-003 y TASK-008 sólo se cierran cuando sus residuales
posteriores queden implementados y reciban los gates exact-head.

## Corte C — experiencia Angular

- [ ] TASK-009 Tipos, mapper, repositorio y store con fence/cola CSRF.
- [ ] TASK-010 Editor accesible de media y composición por variante.
- [ ] TASK-011 PDP/listado/home/favoritos y fallback determinista.

## Corte D — evidencia

- [ ] TASK-015 E2E PostgreSQL/browser y CI alojado sobre el head candidato.
- [ ] TASK-012 Review funcional/código exact-head.
- [ ] TASK-013 Review de performance/recursos exact-head.
- [ ] TASK-014 Review de seguridad exact-head.

Las tres reviews corren en paralelo después de TASK-015 sobre el mismo SHA
inmutable. Sólo tras las tres aprobaciones se registra merge y post-merge en
progreso; cualquier cambio reinicia TASK-015 y los tres dictámenes.

## Gate externo separado

El adapter Cloudinary live no forma parte de estos cortes hasta cerrar cuenta,
hosts/cuenta, acceso privado, TTL, cuotas, secret manager, ambiente de prueba y
GO de seguridad. La implementación local usa únicamente el adapter de prueba.
