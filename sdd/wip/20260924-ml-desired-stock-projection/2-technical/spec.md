# Especificación técnica — proyección de stock deseado ML

## Diseño hexagonal

La regla vive en aplicación/dominio; JDBC/Flyway son adapters. Ningún controller, webhook o worker calcula `sellable` por su cuenta.

```text
Inventory mutation (WEB | INTERNAL)
  └─ InventoryMutationTransaction / StockProjectionPort
       ├─ lock determinista balances + listings
       ├─ DesiredStockProjectionUseCase
       │    ├─ MarketplaceListingProjectionPort
       │    └─ ChannelStockOutboxPort
       └─ commit único: saldo + projection snapshot + immutable outbox + PENDING delivery

Future dispatcher (out of scope)
  └─ may select only current projection_version; never writes inventory
```

Puertos mínimos:

- `DesiredStockProjectionUseCase.project(variantIds, cause, transactionContext): List<DesiredStockProjectionResult>`.
- `MarketplaceListingProjectionPort.lockEligibleAndBlockedByVariants(...)`: carga todos los listings ligados, incluida cuenta/purpose/state/intervention, con locks estables.
- `MarketplaceListingProjectionPort.upsertSnapshot(...)`: compara snapshot y aumenta la versión sólo cuando corresponde.
- `ChannelStockOutboxPort.appendDesiredStockChanged(...)`: inserta outbox inmutable y delivery `PENDING` dentro de la transacción del caller.
- `MarketplaceAccountSelectorPort`: selecciona cuenta externa tipada. Está prohibido codificar exclusiones por `account_key` como `manual-price-writer`.

El adapter JDBC puede implementar los puertos con `JdbcTemplate`, pero los casos de uso de inventario no importan controller, ObjectMapper, HTTP ni SQL concreto.

## Identidad explícita de cuenta

No existe selección de primera cuenta ACTIVE **en los puertos locales que este WIP introduce o modifica**: proyección, lifecycle de listing y CreateListingMapping. Cada una de esas mutaciones recibe o deriva un account_id explícito: lifecycle lo toma del listing objetivo y proyección de inventario enumera cada listing con su account_id ya asociado. MarketplaceAccountSelectorPort valida exactamente ese ID con channel igual a MERCADO_LIBRE, state ACTIVE y purpose EXTERNAL_ML_SYNC; cero o más de una cuenta nunca se resuelven por ORDER BY o literal dentro de ese alcance. Todas las cuentas previas a la migración quedan UNCLASSIFIED y son fail-closed hasta clasificación interna auditada.

`JdbcMercadoLibreService.notify`, cualquier controller/webhook y la autenticación de ingress están fuera de este WIP. No se afirma ni se intenta eliminar su comportamiento global mediante TASK-DSP-001. Una inbox durable actual no constituye prueba suficiente de binding o identidad: mientras no exista un contrato oficial de ingress con binding único y refetch oficial, no hay caller ML hacia este proyector y `notify` permanece sin activar para este flujo. Una feature posterior debe reemplazarlo o endurecerlo con contrato, binding y pruebas propios.

### Contrato de creación de listing y webhook

CreateListingMappingCommand lleva account_id explícito del operador interno autenticado y la autorización se evalúa para ese account_id antes de crear, activar o remapear. Un account_id ausente, ajeno, UNCLASSIFIED, no ACTIVE o no EXTERNAL_ML_SYNC rechaza el comando sin crear listing ni outbox.

La entrada webhook no usa el primer account activo ni confía en account_id del body. Se agrega un binding persistido, sin secreto en claro:

    CREATE TABLE ml_webhook_bindings (
      account_id BIGINT PRIMARY KEY REFERENCES channel_accounts(id) ON DELETE RESTRICT,
      binding_id UUID NOT NULL UNIQUE,
      verification_secret_reference VARCHAR(255) NOT NULL,
      state VARCHAR(16) NOT NULL CHECK (state IN ('ACTIVE','PAUSED','ERROR')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

WebhookBindingAuthenticatorPort recibe el binding configurado y la evidencia que el contrato oficial autorice, verifica la referencia de secreto fuera del payload y devuelve un único AuthenticatedWebhookAccount(account_id). La forma concreta de ruta/header/firma queda sujeta al contrato oficial: el repositorio no inventa HMAC.

Esta feature no implementa, modifica ni activa ingress: no cambia `JdbcMercadoLibreService.notify`, no agrega controller, ni ejecuta este DDL de binding mientras no exista el contrato oficial de webhook. La proyección local no consume inbox ML como caller en este WIP. El binding anterior es una frontera de diseño y un gate externo para endurecer ingress; no es una abstracción que simule autenticación. Cuando exista ese contrato, binding ausente, pausado, ambiguo o no autenticado se rechazará antes de insertar inbox o ACK, y un refetch oficial deberá producir el contexto de cuenta/listing antes de aplicar stock. La migración de ese futuro trabajo dejará inbox histórico intacto y no inferirá secretos; un operador configurará binding y clasificación auditados antes de habilitar ingress. Hasta entonces, `notify` no se convierte en selector ni se habilita por esta feature.

## Modelo de datos propuesto

Migración Flyway nueva, compatible y sin reescribir ledger/outbox existentes:

1. Clasificar `channel_accounts` por `purpose` tipado, por ejemplo `EXTERNAL_ML_SYNC | INTERNAL_PRICE_POLICY`, con backfill revisable. La selección ML para stock requiere `EXTERNAL_ML_SYNC`; el registro heredado interno de promociones queda excluido por propósito, no por literal. Si otro WIP ya provee un selector/purpose canónico equivalente, este WIP lo consume y no duplica DDL.
2. Crear una única proyección mutable de última foto por listing, por ejemplo `channel_listing_stock_projection`; `channel_listings.desired_quantity` continúa como valor de lectura/compatibilidad y se actualiza en la misma transacción, pero la versión canónica vive sólo en la proyección:

```text
listing_id PK/FK channel_listings
variant_id snapshot inmutable, validado bajo lock al escribir (sin FK compuesto al mapping mutable)
desired_quantity >= 0
projection_version > 0
source_cause (WEB_RESERVE | WEB_RELEASE | WEB_EXPIRY | INTERNAL_ADJUSTMENT |
              LISTING_ACTIVATED | LISTING_MAPPING_CONFIRMED)
created_at, updated_at
PRIMARY KEY(listing_id)
```

La fila es una proyección mutable, no evidencia comercial. El historial se conserva en `channel_outbox`; no se actualiza ni borra outbox. La mutación de la foto, su versión canónica y `channel_listings.desired_quantity` de compatibilidad es atómica; no se duplica un contador de versión en channel_listings.

3. El nuevo outbox usa `kind='STOCK_DESIRED_CHANGED'`, `listing_id` y `projection_version` obligatorios, clave idempotente determinista de `(listing_id, projection_version)`, y `payload_redacted` con `listingId`, `variationId` si corresponde, `desiredQuantity`, `projectionVersion`, `sourceCause` y versión del contrato. Añadir CHECK/índice compatible que impida ese kind sin listing o versión y acelere la lectura por `(listing_id, kind, created_at)`. No cambiar la semántica existente de `SALE_APPLIED`.
4. `channel_outbox_delivery` mantiene `PENDING` para estas filas. Este WIP no agrega estados, leases, selector de envío ni mutaciones de delivery.

### Corte de ownership y puente sellado de PIC-009

`master` ya contiene `69f209b` mediante `a886f48`. PIC-009 conserva un producer local que, en su fixture ACTIVE, escribe `LISTING_STOCK` y actualiza `desired_quantity` post-commit. La migración de esta feature no altera ni rellena deliveries de esas filas: el outbox es inmutable. La nueva proyección usa exclusivamente `STOCK_DESIRED_CHANGED` con versión y delivery PENDING.

La implementación empieza por un corte de ownership, no por coexistencia de dos writers. `JdbcBlackStoreMlListingAdapter` deja de ejecutar SQL directo a `channel_listings.desired_quantity` y de insertar `LISTING_STOCK`; se sustituye por un `LegacyBlackStoreProjectionBridgePort` de aplicación que es fail-closed y sólo puede delegar al `DesiredStockProjectionUseCase` cuando éste haya sido implementado y PIC-005 tenga GO separado. Antes de ambos gates devuelve un resultado local `NOT_ELIGIBLE` y no escribe nada, incluso bajo el fixture de activación temporal. No activa el companion ni es una llamada ML/HTTP.

La prueba de transición precede a TASK-DSP-002: con datos representativos y la capability BlackStore temporalmente ACTIVE, el adapter sellado deja `desired_quantity` y la cuenta de `LISTING_STOCK` intactos; la única forma posterior de obtener una intención es el caso de uso canónico versionado. Después del GO de PIC-005, el bridge podrá solicitarle una causa local dentro de la transacción saga correspondiente, nunca hacer SQL directo. Esta feature conserva los registros legacy; no los reescribe, borra, reclasifica ni convierte.

Si la versión actual ya describe mismo variant, cantidad, estado de proyección, razón de withholding, elegibilidad y mapping, el resultado es UNCHANGED: no sube versión ni crea outbox. Todo cambio de elegibilidad a no publicable materializa WITHHELD con una versión nueva y sin outbox. Al activar, reactivar o confirmar mapping se fuerza baseline, de modo que una foto previa no se reutiliza después de una transición administrativa relevante.

## Prerrequisito de base integrada y control de admisión

El punto de partida de implementación es `integration/storecore-int` en `ab817891abb6c7b710bca809804d924401ed74f0`. La lectura de ese árbol el 2026-09-27 encuentra V1–V7 y ningún V8, por lo que V8 es el siguiente número libre **en esa base**. Este checkout WIP permanece en `a886f48` y no se confunde con integración. `TASK-DSP-000` registra SHA, ancestros, migraciones presentes, versión Flyway libre y firmas del adapter. Si integración avanza, se recalcula la versión y se revisa de nuevo el delta; no se reusa ni modifica V7 ni V7.4.2. `TASK-DSP-000A` sella PIC-009 y prueba fixture ACTIVE antes de `TASK-DSP-002`; hasta ese gate no se declara ownership ni coexistencia segura.

## Flyway DDL completo y fail-closed

La próxima versión Flyway legal después de la actualización controlada debe usar DDL equivalente al siguiente, con nombres ajustados sólo si una migración ya incorporada los reserva:

    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    ALTER TABLE channel_accounts ADD COLUMN purpose VARCHAR(32) NOT NULL DEFAULT 'UNCLASSIFIED';
    ALTER TABLE channel_accounts ADD COLUMN eligibility_revision BIGINT NOT NULL DEFAULT 1;
    ALTER TABLE products ADD COLUMN eligibility_revision BIGINT NOT NULL DEFAULT 1;
    ALTER TABLE product_variants ADD COLUMN eligibility_revision BIGINT NOT NULL DEFAULT 1;
    ALTER TABLE channel_listings ADD COLUMN mapping_revision BIGINT NOT NULL DEFAULT 1;
    ALTER TABLE channel_accounts ADD CONSTRAINT ck_channel_account_purpose
      CHECK (purpose IN ('UNCLASSIFIED', 'EXTERNAL_ML_SYNC', 'INTERNAL_PRICE_POLICY'));
    CREATE TABLE channel_listing_stock_projection (
      listing_id BIGINT PRIMARY KEY REFERENCES channel_listings(id) ON DELETE RESTRICT,
      account_id BIGINT NOT NULL, variant_id BIGINT NOT NULL,
      external_listing_id VARCHAR(128) NOT NULL, variation_id VARCHAR(128) NULL,
      desired_quantity INTEGER NOT NULL CHECK (desired_quantity >= 0),
      projection_version BIGINT NOT NULL CHECK (projection_version > 0),
      projection_state VARCHAR(16) NOT NULL CHECK (projection_state IN ('WITHHELD', 'EMITTED')),
      withholding_reason VARCHAR(64) NULL, mapping_fingerprint CHAR(64) NOT NULL,
      eligibility_fingerprint CHAR(64) NOT NULL,
      source_cause VARCHAR(64) NOT NULL CHECK (source_cause IN
        ('WEB_RESERVE','WEB_RELEASE','WEB_EXPIRY','INTERNAL_ADJUSTMENT',
         'LISTING_ACTIVATED','LISTING_MAPPING_CONFIRMED','LISTING_REMAPPED','LISTING_PAUSED',
         'LISTING_REACTIVATED','PRODUCT_DEACTIVATED','VARIANT_DEACTIVATED',
         'PRODUCT_REACTIVATED','VARIANT_REACTIVATED','ACCOUNT_REACTIVATED',
         'CAPABILITY_REACTIVATED','UPGRADE_QUARANTINE')), created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CHECK ((projection_state = 'WITHHELD') = (withholding_reason IS NOT NULL))
    );
    ALTER TABLE channel_outbox ADD COLUMN projection_version BIGINT NULL;
    ALTER TABLE channel_outbox ADD CONSTRAINT ck_channel_outbox_stock_projection
      CHECK ((kind <> 'STOCK_DESIRED_CHANGED' AND projection_version IS NULL)
          OR (kind = 'STOCK_DESIRED_CHANGED' AND listing_id IS NOT NULL
              AND projection_version IS NOT NULL AND projection_version > 0));
    CREATE UNIQUE INDEX uq_channel_outbox_stock_projection_version
      ON channel_outbox(listing_id, projection_version)
      WHERE kind = 'STOCK_DESIRED_CHANGED';
    CREATE INDEX ix_channel_outbox_stock_listing_created
      ON channel_outbox(listing_id, created_at)
      WHERE kind = 'STOCK_DESIRED_CHANGED';
    CREATE TABLE channel_outbox_stock_projection (
      outbox_id BIGINT PRIMARY KEY REFERENCES channel_outbox(id) ON DELETE RESTRICT,
      listing_id BIGINT NOT NULL REFERENCES channel_listings(id) ON DELETE RESTRICT,
      account_id BIGINT NOT NULL, variant_id BIGINT NOT NULL,
      projection_version BIGINT NOT NULL CHECK (projection_version > 0),
      desired_quantity INTEGER NOT NULL CHECK (desired_quantity >= 0),
      mapping_fingerprint CHAR(64) NOT NULL, eligibility_fingerprint CHAR(64) NOT NULL,
      contract_version VARCHAR(32) NOT NULL,
      UNIQUE (listing_id, projection_version)
    );
    CREATE TRIGGER trg_prevent_immutable_channel_outbox_stock_projection
      BEFORE UPDATE OR DELETE ON channel_outbox_stock_projection
      FOR EACH ROW EXECUTE FUNCTION prevent_immutable_mutation();

    INSERT INTO channel_listing_stock_projection
      (listing_id, account_id, variant_id, external_listing_id, variation_id, desired_quantity,
       projection_version, projection_state, withholding_reason, mapping_fingerprint,
       eligibility_fingerprint, source_cause)
    SELECT l.id, l.account_id, l.variant_id, l.external_listing_id, l.variation_id,
           GREATEST(0, COALESCE(b.available_quantity, 0) - COALESCE(b.safety_stock, 0)),
           1, 'WITHHELD', 'UPGRADE_CLASSIFICATION_REQUIRED',
           encode(digest(concat_ws('|', l.account_id, l.external_listing_id,
             COALESCE(l.variation_id, ''), l.variant_id), 'sha256'), 'hex'),
           repeat('0', 64),
           'UPGRADE_QUARANTINE'
      FROM channel_listings l
      LEFT JOIN inventory_balances b ON b.variant_id = l.variant_id
    ON CONFLICT (listing_id) DO NOTHING;

El FK estable de estas dos tablas es sólo listing_id. Account, variant, external_listing_id, variation_id y mapping_fingerprint son snapshots históricos inmutables, validados bajo lock al insert; no son FK compuesto hacia el mapping mutable. Así un remap puede actualizar la proyección actual a WITHHELD versión nueva sin impedirlo por referencias históricas, mientras los outbox anteriores conservan su snapshot y nunca se vuelven candidatos de dispatch.

Remap toma los guards y locks globales, incrementa mapping_revision, invalida el CAS de cualquier proyección preparada con el mapping previo y escribe la foto actual como WITHHELD con source_cause LISTING_REMAPPED. No actualiza channel_outbox_stock_projection ni delivery históricos. Sólo una confirmación humana posterior, bajo el mismo protocolo, revalida el nuevo mapping y crea el baseline EMITTED siguiente.

El backfill no adivina accounts externas ni usa account_key como selector: todas las cuentas existentes empiezan UNCLASSIFIED. Para cada listing existente crea una fila de proyección WITHHELD, versión 1, reason UPGRADE_CLASSIFICATION_REQUIRED, cantidad calculada desde balance y sin outbox/delivery. Las filas históricas SALE_APPLIED y LISTING_STOCK quedan con projection_version nulo y no se reescriben. Antes del INSERT la migración debe validar que ningún listing tenga account, variant o relación de mapping rota; si la validación falla, aborta por completo. Un balance ausente se trata como cero sólo para la cuarentena local, nunca como autorización para EMITTED.

## Orden, concurrencia e idempotencia

### Protocolo único de locking, revisión, CAS y refactor de capability

Cada originador descubre IDs candidatos mediante lectura optimista no autoritativa, incluidos todos los SKU del carrito, order_items, reservas del saga y ambos variants de un remap. Esa lectura no retiene locks de filas de negocio. Todo flujo que puede emitir o retener una proyección usa este orden global en **una** transacción: 1) snapshot de capability con action/config/switch; 2) `channel_accounts` por id ASC; 3) `products` por id ASC; 4) `product_variants` por id ASC; 5) `orders` por id ASC, si aplica; 6) `mp_checkout_attempts` por id ASC, si aplica; 7) `inventory_reservations` por (variant_id,id) ASC, si aplica; 8) `inventory_balances` por variant_id ASC; 9) `channel_listings` y `channel_listing_stock_projection` por listing_id ASC. Bloquea **todas** las líneas antes de escribir la primera. Un caller que no usa una tabla omite ese paso, pero nunca vuelve a un paso anterior. Orden/attempt/reserva nuevos y mutaciones de payment/ledger ocurren sólo después de los guards y locks previos aplicables. La clave idempotente se serializa antes de crear filas y se revalida si otro comando ganó la carrera.

`capability_actions(MARKETPLACE_ML,SYNC)` es una fila guard obligatoria, presembrada por la siguiente migración legal; si falta se falla cerrado. En PostgreSQL 16, `SELECT ... FOR SHARE` requiere UPDATE aun sin DML. Una función `SECURITY DEFINER` de lectura y lock, propiedad de rol dedicado NOLOGIN con SELECT/UPDATE mínimos sobre **action, config y switch**, fija `search_path=pg_catalog,pg_temp`, usa tablas `public.` calificadas y SQL estático, y valida internamente la pareja constante `MARKETPLACE_ML/SYNC`. No acepta SQL, identificadores ni módulo arbitrario. En una llamada toma `FOR SHARE` primero sobre action, luego configuración de instalación y luego switches activos/efectivos ordenados por key e id; devuelve foto tipada completa: semántica de acción, state/config_version del módulo y efecto/identidad/vigencia de cada switch aplicable. Ausencia, duplicidad o valor inválido falla cerrado; no crea ni altera filas. Locks persisten hasta commit/rollback. Revoca EXECUTE a PUBLIC y sólo concede EXECUTE a runtime. Runtime NOLOGIN no recibe UPDATE directo sobre ninguna de las tres tablas.

V3 no puede modificarse: su administración bloquea `module_configurations` en algunos caminos sin guard y concede EXECUTE de funciones administrativas a PUBLIC. La migración **aditiva V8 o posterior** revoca esos EXECUTE de PUBLIC y reemplaza/encapsula los entry points V3 para que rechacen MARKETPLACE_ML antes de adquirir config/switch. Sólo rutinas administrativas ML action-aware, autorizadas y auditadas, toman guard `FOR UPDATE` primero y luego config/switch en el orden del snapshot. Create/replace/remove de switch y cambios de estado/configuración no tienen ruta genérica, endpoint, perfil ni DML directo que saltee el guard. `JdbcCapabilityService.decide` consume la foto completa dentro de la transacción de emisión; no combina guard bloqueado con consultas sueltas de config/switch. La carrera proyector frente a create/replace/remove y cambio de estado/configuración termina sin deadlock; ninguna emisión basada en snapshot viejo confirma tras la revocación administrativa.

Después de los locks se reconsulta mapping account/listing/product/variant, purpose, manual_intervention_required, active state, mapping_revision y eligibility_revision de account/product/variant. La elegibilidad de capability, config_version y switches proviene exclusivamente del snapshot bloqueado, no de consultas independientes. El insert o update de proyección usa CAS contra la versión de proyección y eligibility_fingerprint esperados, calculado sobre esos revisions, snapshot de capability y mapping fingerprint. Si el CAS devuelve cero filas, reinicia desde candidatos; no confirma EMITTED. Toda transición de account state/purpose, product status, variant active, listing mapping/state/manual flag o capability bloquea el guard, incrementa su revision o config_version y, si afecta listings, usa el mismo protocolo para escribir WITHHELD antes de commit. Así una revocación concurrente no puede dejar EMITTED después de su commit.

### Privilegios mínimos del runtime y pruebas negativas

La siguiente migración legal es aditiva y declara un manifiesto de privilegios de esta feature, sin depender de grants amplios heredados. `storecore_migrator` conserva ownership/DDL; `storecore_runtime` es NOLOGIN y recibe SELECT sobre account/product/variant/listing/balance/proyección y modelos capability; UPDATE sólo de columnas de saldo/lifecycle/proyección necesarias; INSERT (sin UPDATE/DELETE) sobre `channel_outbox`, `channel_outbox_stock_projection`, `channel_outbox_delivery` y audit append-only; INSERT/UPDATE (sin DELETE) sobre `channel_listing_stock_projection`. El snapshot se bloquea por `SECURITY DEFINER`, sin UPDATE directo para runtime sobre action/config/switch. Administración continúa mediante funciones estrechas controladas y auditadas, nunca DML directo. Se inspeccionan y revocan grants heredados efectivos que permitan bypass, incluidos EXECUTE V3 de PUBLIC, membresías y herencias, antes de afirmar aislamiento; el delta no amplía ALL ni DDL.

Las pruebas PG16 autentican con login de prueba que hereda **sólo** `storecore_runtime` y demuestran snapshot permitido con action/config/switch vigentes y locks retenidos en la misma transacción. Una segunda sesión intenta cambiar cada componente y espera al commit; un snapshot nuevo observa el cambio. Se inspeccionan `has_table_privilege`, `has_function_privilege`, PUBLIC y membresías efectivas, y se ejecutan denegaciones reales: INSERT/UPDATE/DELETE directos de action/config/switch, EXECUTE V3 genérico para ML o como PUBLIC, DML sobre audit histórico/outbox existente/snapshot histórico, DELETE de proyecciones/delivery y DDL. También se prueba rol sin grant y `search_path` adversarial. La mutación permitida se prueba sólo por el use case transaccional, con rollback atómico; un grant amplio heredado no puede hacer pasar el gate.

`ml-inbox-to-projection` es un WIP futuro y bloqueado por el contrato oficial de ingress: deberá refactorizar `InboxApplicationWorker` para binding único, refetch oficial, contexto de cuenta/listing y locks multi-variant antes de solicitar el proyector. Esta feature no cambia ese worker ni promete que una fila inbox durable active proyección.

### Atomicidad catálogo e inventario

JdbcCatalogService.saveProduct debe delegar a un caso de uso transaccional único. Producto y variant active, alta o cambio de balance, ledger aplicable y las proyecciones de todos los variants afectados se confirman o revierten juntos. Para producto multi-variant, los IDs candidatos se ordenan con el mismo protocolo global. El proyecto verifica product.active y variant.active tanto al bootstrap como antes de EMITTED; desactivación genera WITHHELD versionado sin outbox, y reactivación sólo genera baseline tras revalidación completa.

1. El caller valida su operación y obtiene IDs candidatos sin autoridad. Antes de cambiar saldo, estado de order/attempt/reserva, catálogo, mapping o proyección adquiere **todos** los locks aplicables en el protocolo global anterior; no puede empezar por attempt, order, reserva o balance ni tomar locks según el orden del payload.
2. Para cada variant afectado, cargar `channel_listings` y sus proyecciones con `FOR UPDATE` en `listing_id ASC` después de los guards y balances. En remapeo, bloquear los guards, ambos balances por `min(oldVariant,newVariant), max(...)`, y después el listing. Nunca se hace lock remoto.
3. Calcular `GREATEST(0, available_quantity - safety_stock)`. No leer ni restar `reserved_quantity` para la fórmula.
4. Evaluar elegibilidad. Para ACTIVE, cuenta externa clasificada/autorizada, capability activa, producto/variant activos y sin intervención, comparar la última foto. Si cambió o es baseline, incrementar la versión y persistir foto, outbox y delivery en la misma transacción. Para no elegible, incrementar la versión y persistir el snapshot WITHHELD con razón estable en la misma transacción; no crear outbox ni delivery.
5. La clave outbox determinista y `UNIQUE(listing_id, projection_version)` protegen replay. Una violación de identidad se relee y debe devolver exactamente el snapshot existente; una incoherencia de payload/version falla cerrada y se registra para conciliación, nunca se inventa una nueva cantidad.

La coalescencia futura es una regla de lectura: un dispatcher sólo puede reclamar una fila PENDING cuyo projectionVersion coincida con la versión actual, snapshot de variant/mapping fingerprint coincidente, listing/product/variant ACTIVE, sin intervención, capability activa y cuenta externa elegible. Todo mensaje más viejo queda fuera de selección y nunca se publica tarde. Hasta existir ese WIP, no hay query de claim ni cambio de delivery.

## Integración con operaciones existentes

- **WEB:** se implementa release explícito idempotente como caso de uso interno `releaseSaga` en TASK-DSP-004. Su primer caller es la terminación MP verificada como no pagada; no libera un pago pendiente o ambiguo ni agrega cancelación pública. El comando revalida order/attempt/reservas bajo lock, marca `RELEASED`, añade ledger `RELEASE`, restaura available y reserved una sola vez y proyecta todas las líneas en la misma transacción. Expiry marca `EXPIRED` por su ruta propia. Carrito/checkout reserve, `consumeSaga` y consumo MP confirmado, release, expiry y ajuste recopilan todos los SKU antes de locks y respetan el orden global. Proyección y todas las líneas se confirman o revierten en la transacción del originador; `consume` de reserva ya neteada puede producir `UNCHANGED`, pero no se omite.
- **Secuencia de callers:** `JdbcCartService.checkout` prepara carrito/claim/order y reserva multi-SKU en una unidad ordenada. `MpOrderApplicationWorker.apply/accredit/terminateUnpaid/consumeOrReview` descubre attempt/order/order_items sin lock autoritativo, toma snapshot y locks en orden y recién entonces muta payment, reservas, balance y estados. El lease de `mp_order_notification_processing` se reclama en transacción separada y se libera antes de esta unidad. `MpCheckoutAttemptService` alinea order antes de attempt cuando coincida con el mismo flujo. `JdbcInventoryService.consumeSaga/expireOverdue` deja de bloquear reservas antes del snapshot; expiry procesa lotes acotados y ordenados. En nueva reserva MP, verificación de stock y todas las líneas de la saga son una sola unidad; no se hacen `FOR UPDATE` por item en orden de payload. Si candidatos cambian al revalidar, rollback/retry desde descubrimiento sin conservar locks parciales.
- **Ajuste interno:** la misma transacción del ledger `ADJUSTMENT` proyecta listings afectados.
- **Venta ML / inbox:** fuera de alcance. El futuro WIP `ml-inbox-to-projection`, bloqueado por binding oficial y refetch, definirá la llamada transaccional posterior a `SALE_APPLIED`; este WIP no toca `InboxApplicationWorker` ni usa su inbox como caller.
- **`JdbcMercadoLibreService.saveListing`:** se reemplaza la asignación directa `ACTIVE` por operación explícita de mapping/activación. Crear o remapear no publica automáticamente; un remapeo bloquea con `manual_intervention_required=true` y audit event. La confirmación humana reevalúa y materializa baseline.
- **`JdbcPromoService`:** los listings internos para políticas manuales se marcan `INTERNAL_PRICE_POLICY`; su creación no llama al proyector ni produce stock outbox. Si la infraestructura de propósito ya fue resuelta por otro WIP, sólo usa su puerto.
- **`JdbcCatalogService.saveProduct`:** producto/variant active y setAvailableQuantity se trasladan al mismo límite transaccional del proyector; desactivación crea WITHHELD y reactivación, tras revalidación, produce baseline.
- **Cuenta/capability:** la clasificación de una cuenta existente no publica por sí misma. La reactivación auditada de cuenta, capability o listing invoca el proyector con saldo actual y crea el baseline PENDING sólo si pasa toda la elegibilidad.

Los changesets no presuponen las ACL/PIC POS de otra rama. La integración BlackStore no es trigger ni consumidor y permanece prohibida hasta PIC-005 GO.

## Transacciones, errores y observabilidad

El proyector no abre una transacción separada después de que cambió inventario: participa en la del comando originador. Fallar al insertar la projection/outbox/delivery hace rollback de esa unidad, incluido el saldo/ledger originador y, para saveProduct, los cambios de catálogo. Si no hay listing, el comando devuelve NO_LISTING. Si hay listing no elegible, confirma el snapshot WITHHELD versionado sin inventar una entrega.

Auditar `LISTING_REMAP_BLOCKED`, `LISTING_MAPPING_CONFIRMED` y resolución de intervención con actor, motivo redacted, listing, variants anterior/nuevo y versiones, sin tokens, secretos, precio ni PII. Medir proyecciones por resultado, edad de PENDING por kind/version y conteo de WITHHELD; ninguna métrica afirma entrega remota.

## Verificación prevista

- PG16/Testcontainers: fórmula neta de reservas; carrito/checkout, consume MP, release explícito por terminal no pagado, expiry y ajuste; multi-SKU en orden inverso; dos listings por variant; nueva activación; pause/manual; remap + confirmación; cuenta interna de promo excluida; carrera create/replace/remove de kill switch y estado/configuración contra emisión.
- Replays y concurrencia: doble llamada misma causa, dos transacciones sobre mismo listing y cambios sucesivos aseguran versión monotónica y que una salida vieja no es candidata de la proyección actual.
- Rollback: trigger de prueba que falla `channel_outbox_delivery` para `STOCK_DESIRED_CHANGED`; verificar rollback de balance, ledger originador, snapshot y outbox.
- Contratos: outbox `SALE_APPLIED` y `STOCK_DESIRED_CHANGED` siguen diferenciados; deliveries recién creadas son sólo `PENDING`; no hay HTTP/red/credenciales/dispatcher.
- `mvn -q test`, tests focalizados y `git diff --check`; CI remoto sólo cuenta cuando exista runner verde.
