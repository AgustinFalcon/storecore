# Sol gate — remaining work
**Fecha:** 2026-09-23

| Item | Verdict | Limits |
|---|---|---|
| TASK-PIC-009 local ML outbox double | CONDITIONAL_GO | Sólo `channel_outbox`, con doubles locales y sin delivery/HTTP ML. Cero enqueue mientras `BLACKSTORE_INTEGRATION` esté `DISABLED`. |
| TASK-L3-003 OpenAPI/reconcile review | CONDITIONAL_GO | Empieza únicamente después de cerrar PIC-009 con pruebas verdes; es revisión, no permiso para ampliar el contrato. |
| UX-ANG StoreCore Stitch→Angular | CONDITIONAL_GO | Sólo las rutas P-01..P-03, C-01..C-09 y U-01..U-10 ya existentes. Sin SDK de pagos/fiscal/MP, secretos ni endpoints nuevos. |
| BSUX-ANG BlackStore Stitch→Angular | CONDITIONAL_GO | Sólo `/`, `/caja`, `/catalogo`, `/ticket` y `/reportes`. No agregar `/sesion`, `/caja/cierre` ni `/ticket/:saleId` bajo este gate. |
| BlackStore StoreCore connector adapter | CONDITIONAL_GO | Fixture/localhost/Testcontainers únicamente. Re-pin obligatorio del YAML antes de código de transporte. Sin companion, identidad o credenciales live. |
| Fiscal / ARCA adapter | NO-GO | Sin código, DDL, worker, emisión, secretos ni inferencias regulatorias. |
| MP-LIVE-05 | NO-GO | Falta evidencia oficial real, cuenta y credenciales fuera del repo/CI, y un gate Sol separado. |
| Live BlackStore companion, secrets, tag, deploy, `/sdd.finish` | NO-GO | No conexión live, secretos, tag, deploy, publish, archive ni declaración production-ready. |

## 1. TASK-PIC-009 — local ML outbox double

**Veredicto: CONDITIONAL_GO**

### Por qué

PIC-001..008/010 y las pruebas HTTP locales ya evidencian el ledger `EXTERNAL_BLACKSTORE`, la saga, el fail-closed y la restauración a `DISABLED`. PIC-009 es el residual implementable del gate POS anterior; no necesita acceso a Mercado Libre para probar que un commit externo produce la intención local correcta.

### Límites

- La única salida autorizada es una fila inmutable en `channel_outbox`; no se autoriza HTTP ML, SDK, webhook, delivery worker, envío ni intento de entrega.
- Con `BLACKSTORE_INTEGRATION=DISABLED` no se crea outbox ni ningún otro side effect, incluso si existe cuenta/listing fixture.
- La prueba positiva usa únicamente Testcontainers/doubles locales y la activación CAS temporal ya autorizada; al terminar restaura `DISABLED`.
- `desired_quantity` se deriva del ledger/autoritativo local después del commit. `observed_quantity` nunca escribe ni corrige ledger.
- La idempotencia debe impedir doble outbox ante retry/concurrencia del mismo commit.
- No inventar HMAC, autenticación vendor, credenciales, `store_id`, `channel=POS` ni `SALE` sobre `EXTERNAL_BLACKSTORE`.
- No tocar un adapter HTTP ML existente para convertir este double en integración real.

### Qué puede implementar Luna

Completar `TASK-PIC-009` y sus pruebas de outbox local: caso positivo bajo ACTIVE temporal, idempotencia/concurrencia y caso `DISABLED` con cero enqueue. Nada live.

## 2. TASK-L3-003 — OpenAPI y reconcile

**Veredicto: CONDITIONAL_GO**

### Por qué

La matriz HTTP 200/304/409/410/429 y reconcile read-only ya tienen evidencia local aceptada, pero `TASK-L3-003` depende expresamente de PIC-009, que sigue `in_progress`.

### Límites

- No iniciar ni marcar done hasta que PIC-009 tenga pruebas verdes y quede done.
- Revisar que `1.0.0-draft` siga siendo el único YAML canónico, con base path `/blackstore-integration/v1`.
- Reconcile permanece intersección caller-supplied, read-only, sin escrituras de ledger y sin autorizar re-POST por receipt desconocido.
- La revisión no puede cambiar OpenAPI, agregar endpoints, aprobar companion live ni reinterpretar Testcontainers como compatibilidad cross-repo.

### Qué puede implementar Luna

Después de PIC-009, producir la revisión/evidencia de `TASK-L3-003` y actualizar honestamente su estado. No agregar comportamiento.

## 3. UX-ANG — StoreCore Stitch→Angular

**Veredicto: CONDITIONAL_GO**

### Por qué

El sistema visual, DS-00/04/05/06 y el mapping Stitch de P/C/U están completos; las views y rutas destino ya existen en master. El bloqueo restante es el gate de implementación, no falta de diseño.

### Límites

- Rutas permitidas: `/`, `/catalog`, `/catalog/:sku`, `/cart`, `/checkout`, `/checkout/result/:orderId`, `/customer/session`, `/customer/register`, `/customer/profile`, `/customer/addresses`, `/customer/orders`, `/customer/orders/:id`, `/user/session`, `/user/content`, `/user/catalog`, `/user/promos`, `/user/orders`, `/user/orders/:id`, `/user/inventory`, `/user/mercadolibre`, `/user/capabilities` y `/user/profile-import`.
- Mantener `Container → View → ComponentStore → UseCase → IRepository → HTTP`, guards actuales y repositorios HTTP de producción.
- USER y CUSTOMER conservan identidades, cookies, guards y rutas separadas. No compartir sesión ni auto-alta.
- Stitch es referencia visual, no fuente de datos ni contrato runtime. DEMO/fixtures sólo donde el baseline ya los autoriza y nunca como producción.
- Checkout sigue siendo orden/redirección HTTPS allowlisted; no agregar SDK browser de Mercado Pago, pago nuevo, captura, confirmación por UI ni secretos.
- No agregar fiscal/ARCA, automatización ML, favoritos, nuevas capabilities, endpoints, Flyway o Kotlin.
- Conservar accesibilidad, estados globales, `prefers-reduced-motion` y pruebas existentes; no declarar pixel parity como prueba funcional.

### Qué puede implementar Luna

Volcar DS-00..U-10 a las views Angular existentes y ajustar estilos/componentes/estado frontend dentro de esas rutas, con pruebas frontend enfocadas.

## 4. BSUX-ANG — BlackStore Stitch→Angular

**Veredicto: CONDITIONAL_GO**

### Por qué

DS y POS-01..POS-08 están documentados y mapeados, pero el código actual sólo expone cinco rutas. Este gate autoriza el volcado visual sobre superficies existentes sin mezclarlo con el connector.

### Límites

- Rutas permitidas: `/`, `/caja`, `/catalogo`, `/ticket` y `/reportes`.
- `/sesion`, `/caja/cierre` y `/ticket/:saleId` no pueden agregarse bajo este gate. POS-06, POS-07 y POS-08 quedan como referencia para un gate de rutas/guards separado.
- Mantener el simulador/fixtures y PostgreSQL local del piloto; no llamar `/blackstore-integration/v1`.
- No agregar connector HTTP, StoreCore DB access, fiscal, MP browser SDK, secretos, pagos nuevos ni comportamiento live.
- No mezclar USER BlackStore con CUSTOMER StoreCore. No inventar auth/HMAC.
- El volcado visual no puede cambiar las reglas de caja, ticket, reserva, commit/release, reversa o reportes ya aprobadas.

### Qué puede implementar Luna

Aplicar Stitch a los cinco componentes/rutas existentes y sus estados visuales, manteniendo intactos los contratos funcionales del piloto.

## 5. BlackStore StoreCore connector adapter

**Veredicto: CONDITIONAL_GO**

### Por qué

La evidencia StoreCore PIC-001..008 requerida por el start gate existe ahora, incluyendo HTTP 200/304/409/410/429 bajo ACTIVE temporal por CAS en Testcontainers y baseline `DISABLED` restaurado. Eso satisface el gate de inicio para un consumidor local y fail-closed; no satisface un companion live.

El lock documental BlackStore aún declara SHA-256 `aba6974723b47d2f5e28a170d3f6e41ecb3387c04e10debcdea097b2bff99bda`, mientras el YAML canónico actual `1.0.0-draft` calcula `7b907a2e11c52a66b7253407fb3f9450cae7b792beccf34c1636be9d3945de30`. Ese drift debe resolverse antes del cliente HTTP.

### Límites

- `TASK-ADP-001` debe primero registrar el handoff PIC-001..008 y corregir/pinnear path, versión y SHA-256 actuales. Hasta que pase esa validación, no implementar transporte.
- Después del pin, pueden ejecutarse `TASK-ADP-002..010` y sus L3 en orden de dependencias sólo contra fixtures, mocks, localhost o un StoreCore/Testcontainers efímero controlado.
- Las pruebas de identidad/TLS/rotación usan referencias opacas y certificados/tokens sintéticos no reutilizables; ningún secreto real entra al repo, CI, logs o evidencia.
- Capability y kill switch nacen deshabilitados. Falla de digest, identidad, scope, TLS o binding debe impedir la llamada.
- Persistir intent/outbox antes de HTTP; recuperación GET-first; retry acotado; respetar `Retry-After`; 410/unknown reconcile nunca autorizan re-POST.
- Sin copia de OpenAPI, acceso cross-database, DSN StoreCore, `store_id`, shared runtime, `channel=POS`, `SALE` en `EXTERNAL_BLACKSTORE`, HMAC inventado ni tráfico POS real.
- La secuencia local ADP-009/010 no es canary, rollout, compatibilidad live ni autorización operativa.

### Qué puede implementar Luna

En BlackStore, cerrar primero `TASK-ADP-001` con el hash canónico actual; luego implementar y validar el adapter en orden hasta los reviews L3 usando únicamente entornos locales/efímeros. Toda configuración live permanece fuera de alcance.

## 6. Fiscal / ARCA adapter

**Veredicto: NO-GO**

### Por qué

No existe nueva evidencia oficial fechada, matriz auténtica aprobada por titular/contador ni cierre de las decisiones fiscales requeridas.

### Límites

No código, DDL, capability, inbox/outbox, worker, adapter, emisión, certificado, secreto, fixture que simule producción ni lógica para ocultar/evasión.

### Qué puede implementar Luna

Nada fiscal. Sólo conservar la documentación `documented_deferred`.

## 7. MP-LIVE-05

**Veredicto: NO-GO**

### Por qué

MP-LIVE-01..04 están cerrados fail-closed, pero no hay cuenta, credenciales ni evidencia de pago real oficial fuera del repo/CI.

### Límites

No credenciales, pago real, activación, CI con secretos, SDK browser, webhook live ni declaración de cobro probado.

### Qué puede implementar Luna

Nada de MP-LIVE-05. Mantener el WIP `documented_deferred`.

## 8. Live companion, secrets, tag, deploy y `/sdd.finish`

**Veredicto: NO-GO**

### Por qué

Testcontainers prueba el contrato local, no identidad, red, credenciales, operación ni compatibilidad de un companion real. Tampoco existe evidencia nueva para release/archive.

### Límites

- No conectar StoreCore y BlackStore live, aceptar tráfico POS real ni configurar endpoints/hosts reales.
- No crear, copiar, rotar o usar secretos/certificados/tokens reales.
- No tag, deploy, release, publish ni cambios de CI para credenciales.
- No `/sdd.finish` ni mover estos WIP a `sdd/features/`; PIC-009/L3-003, MP-LIVE-05 y gates live siguen abiertos/bloqueados.
- GitHub jobs no ejecutados por billing no cuentan como CI verde.

### Qué puede implementar Luna

Nada live ni de cierre/archive.

## Luna next

1. StoreCore `TASK-PIC-009` con `channel_outbox` local y prueba de cero enqueue bajo `DISABLED`.
2. StoreCore `TASK-L3-003`, sólo después de PIC-009 verde.
3. StoreCore `UX-ANG` sobre las rutas P/C/U existentes y dentro de los límites visuales/arquitectónicos.
4. BlackStore `BSUX-ANG` sólo en `/`, `/caja`, `/catalogo`, `/ticket` y `/reportes`.
5. BlackStore `TASK-ADP-001`: registrar handoff y re-pin del YAML; después `TASK-ADP-002..010` y L3 en orden, sólo con fixture/localhost/Testcontainers.
