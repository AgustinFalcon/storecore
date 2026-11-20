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

### Subcorte aprobado — normalización segura

- [x] MEDIA-NORMALIZE-001 ADR, límites tipados, estados/resultados cerrados y
  puerto de aplicación fail-closed.
- [x] MEDIA-NORMALIZE-002 Parser estructural JPEG/PNG/WebP y corpus de framing.
- [ ] MEDIA-NORMALIZE-003 Helper JVM aislado, normalización determinista y
  límites efectivos de proceso/temporales.
  - [x] `MEDIA-NORMALIZE-003A`: protocolo binario cerrado, workspace privado y
    puertos de supervisor testeables. Un launcher ProcessBuilder best-effort y
    el helper genérico viven sólo en test para validar el contrato; no son una
    garantía productiva de contención. PR #306 head `4efbee490736627ff6185fef4d8a99cee358d125`
    pasó Verify #825 run `44548801998` 5/5 y dos reviews exact-head independientes
    sin P0–P3. Merge `e2571fdff4784542dabbc45918f0d2cae703e42f`.
  - [ ] `MEDIA-NORMALIZE-003B`: worker real en el artefacto firmado,
    TwelveMonkeys fijado, JPEG/PNG determinista, self-test y attestación de
    aislamiento Linux poseído por el SO. Debe aportar el launcher productivo y
    su attestación; no se habilita en Windows productivo sin Job Object.
    - [x] `MEDIA-NORMALIZE-003B-1`: supply chain y providers, sin engine ni
      activación. TwelveMonkeys 3.15.3 (`imageio-core`, `imageio-jpeg`,
      `imageio-webp`), Enforcer, SBOM CycloneDX, allowlist de licencias, CVE
      high/critical fail-closed e inventario ImageIO cerrado. CI fija Temurin
      `21.0.13+9`. PR #307 head `ffaaab4ebf19020d2d95845bbb0e067d7597eba4`
      pasó Verify #828 run `44784133698` 5/5 y dos reviews exact-head
      independientes sin P0–P3. Merge
      `ee1fa96edc0eb1c2722000b3980acecb15706ef7`.
    - [x] `MEDIA-NORMALIZE-003B-2`: engine determinista y WorkerMain inactivo.
      PR #309 head `b41fc7ea369da338e07427c837518aa518dfe398` pasó Verify
      #837 run `44795354530` 5/5 y dos reviews exact-head sin P0–P3. Merge
      `17aadc84fbaf6a762d17414311b8a6559ed19d3b`.
    - [ ] `MEDIA-NORMALIZE-003B-3`: self-test y attestación offline.
      Implementado localmente con operación cerrada `SELF_TEST`, fingerprint
      del jar/runtime/plataforma/dependencias/providers/política/corpus y
      evaluador fail-closed. Abierto hasta CI y dos reviews exact-head; no
      declara `Ready`.
    - [ ] `MEDIA-NORMALIZE-003B-4`: contención Linux real y factory fail-closed.
      Único corte que puede devolver `Ready`.
- [ ] MEDIA-NORMALIZE-004 Corpus adversarial, CI y reviews exact-head.

TASK-005 sólo se cierra cuando los cuatro subcortes queden aprobados. Ninguno
habilita HTTP, proveedor live, secretos, deploy u homologación.

### Subcorte aprobado — alta atómica local

- [x] MEDIA-CREATE-001 Definir comando create-only, referencias de variante de
  cliente, resultado cerrado y hash canónico versionado.
- [x] MEDIA-CREATE-002 Agregar ledger V30 de idempotencia por draft con
  ownership compuesto, snapshot durable y privilegios runtime mínimos.
- [x] MEDIA-CREATE-003 Implementar una única transacción local para producto,
  variantes, stock inicial, claim de draft, asociaciones, auditoría y receipt.
- [x] MEDIA-CREATE-004 Cubrir replay, hash distinto, ownership/TTL/estado,
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
