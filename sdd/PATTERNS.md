# Patterns — StoreCore

## Installation and profile boundary

Una instalación equivale a un merchant/VM/base/dominio. No agregar shared runtime, `store_id`, `store_hosts`, TenantContext ni routing de tenant. `universal-tools-profile@1.0.0` es un artefacto de datos versionado: declara compatibilidad core 1.x, se previsualiza, se importa mediante merge explícito y auditado, y nunca reescribe valores históricos. Secrets, credenciales y ownership no viajan en perfiles.

## Production architecture

Kotlin domain no importa frameworks; application expone use cases/ports; web, persistence, MP y ML son adapters. Angular usa domain/application/repository/infrastructure/presentation. El storefront productivo usa repository HTTP; `storefront-prototype` fixture-only conserva banner DEMO y no satisface las tareas de producción.

## Capability configuration and kill switches

Cada módulo tiene configuración tipada y estado `DISABLED | READ_ONLY | ACTIVE | PAUSED | ERROR`. Un estado limita el comportamiento del módulo; no es una bandera arbitraria. Un kill switch es estrecho, auditable y temporal: `owner`, `reason`, `created_at`, `expires_at`, `removal_ticket` y acción afectada obligatorios. No crear `feature_flags`, booleanos permanentes ni switches que habiliten escritura sin capability `ACTIVE`.

## Canonical inventory and channel authority

SKU es la identidad canónica. WEB reserva/consume/libera mediante operation key y ledger append-only. ML se vincula explícitamente por account/listing/variation; inbox durable precede ACK, refetch oficial precede efectos y reconciliación es acotada/auditable. ML puede reflejar ventas publicadas, pero StoreCore registra una sola venta local y no duplica decremento. POS no es módulo del core: el companion opcional BlackStore usa `storecore-pos-integration-contract-v1` (prefijo `/blackstore-integration/v1`, tablas `blackstore_integration_*`, delta **no** aprobado). Prohibido `channel=POS`, `store_id` y acceso cruzado a DB.

Todo caller que proyecta stock deseado usa un orden de locks único: snapshot `MARKETPLACE_ML/SYNC`, cuentas, productos, variants, (orders/attempts/reservas si aplican), balances, listings ASC. Lifecycle y remap no toman `channel_listings` antes de products/variants/balances (`ChannelProjectionLockOrder`, PR #93).

## Commercial safety

Precio base, desired, observed y effective promo son valores distintos. Sólo un writer local de precio puede estar `ACTIVE` por listing; automatización ML y writer manual son mutuamente excluyentes. Market intelligence usa únicamente señales oficiales/read-only permitidas; no scraping, elusión de términos ni supuesto “top 5”. Campañas requieren vigencia, prioridad, margen, auditoría, aprobación y rollback. Black Friday es un evento configurable, no una regla hardcodeada.

## Frontend production path

Container → view → ComponentStore → use case → HTTP repository. CUSTOMER y USER no comparten cookie. El browser no guarda Bearer/JWT. UX DS-00…U-10 está en código; axe corre con `npm run test:a11y`.

## Compliance boundary

No ocultar ventas, alterar montos, evadir ni bypass fiscal. El adapter fiscal no se implementa en StoreCore core: queda como integración/biblioteca externa diferida y auditable.
