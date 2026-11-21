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
    - [x] `MEDIA-NORMALIZE-003B-3`: self-test y attestación offline.
      PR #310 head `f6bb3a326ddfab23cfe2162ad21c6d805f3c04e5` pasó Verify
      run `44801937465` 5/5 y dos reviews exact-head sin P0–P3. Merge
      `28b99b75cb3d683f60f2c1ca547986ef4b8fe0a8`. Post-merge Verify run
      `44804049350` 5/5. No declara `Ready`.
    - [ ] `MEDIA-NORMALIZE-003B-4`: contención Linux real y factory fail-closed.
      Único corte agregado que puede devolver `Ready`.
      - [x] `MEDIA-NORMALIZE-003B-4A`: factory fail-closed, unidad transitoria,
        attestación, terminación verificada y retención insegura. El workspace
        privado backend-only permanece incompatible con el UID dedicado y no
        devuelve `Ready`. PR #313 head
        `649f11242b47eca59ef28b9d87febfa85f3acab3`, merge
        `d824e0751010a5f3a5f7e3522329832f02018bd6`; tests focales 23/23 y dos
        reviews exact-head independientes sin P0–P3.
      - [ ] `MEDIA-NORMALIZE-003B-4B`: broker Linux root-owned de autoridad
        mínima, handoff cross-UID sellado, tmpfs por job con cuota agregada,
        runtime/JAR root-owned versionado y reconciliación durable de
        unit/mount/quarantine. Requiere ADR/spec aprobados antes de código.
        - [x] `003B-4B-1`: workspace Rust y toolchain/lockfile; codec compartido
          Kotlin/Rust, helper sin privilegios, Unix peer credentials,
          `SCM_RIGHTS` de exactamente un FD y snapshot broker-owned. CI Linux,
          sin root, mount, D-Bus, wiring Spring ni `Ready`. PR #316 head
          `be7b822581aff1f7c26463c938e6eef35fe81c02`, merge
          `df13f2dda89440a77bd7bcec7b48f1b1c139fe25`; Verify exact-head
          `44826977557` y post-merge `44828593553` terminaron 6/6. Tres reviews
          exact-head independientes aprobaron sin P0–P3.
        - [x] `003B-4B-2`: máquina durable/CAS, budgets globales, journal
          atómico y reconciliación con adapters fake; corrupción cierra
          admisión. PR #319 head
          `9e77bcf8de7b2a874d0998cd43435f999050f85b`, merge
          `381296d6e267d4c2813345f3bb635ad927a1aff5`; Verify exact-head
          `44837144576` y post-merge `44838436904` terminaron 6/6. El job
          broker ejecutó 46 tests. Dos reviews independientes Grok 4.7
          (sustituto autorizado de Sol por cupo agotado) aprobaron sin P0–P3.
        - [ ] `003B-4B-3`: daemon endurecido, runtime aprobado y unidades
          transitorias `.mount`/worker administradas por PID 1 vía D-Bus, sin
          aceptar comandos, paths o properties del cliente.
          - [ ] `003B-4B-3A`: tipos cerrados de perfil/política, identidad y
            specs derivadas de mount/worker, más attestación fail-closed de la
            cadena runtime root-owned. Sin conexión D-Bus ni efectos PID 1.
          - [ ] `003B-4B-3B`: adapter `zbus` blocking con allowlist exacta de
            `StartTransientUnit`/stop/inspect y traducción única de estados y
            propiedades observadas. Sin aceptar valores privilegiados del
            cliente.
          - [ ] `003B-4B-3C`: daemon instalable endurecido, orquestación durable
            mount/worker y cleanup/reconciliación real. `4B-3` sólo cierra con
            los tres subcortes aprobados.
        - [ ] `003B-4B-4`: `BrokeredMediaByteNormalizer`, traducción wire única,
          lifecycle/ACK del artefacto y capability todavía bloqueada hasta 4C.
      - [ ] `MEDIA-NORMALIZE-003B-4C`: harness Linux real con UID A/UID B,
        SELF_TEST/NORMALIZE dentro de la unidad, attestación efectiva de cgroup
        v2/mount/quota, aislamiento entre jobs, fallos y reinicios. Mocks o
        ejecución directa del jar no cierran el gate.
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
