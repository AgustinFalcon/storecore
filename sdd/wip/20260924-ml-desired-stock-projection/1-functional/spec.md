# Especificación funcional — proyección de stock deseado ML

## Problema y resultado esperado

StoreCore conoce el inventario local, pero una venta WEB, una reserva, su liberación/expiración o un ajuste interno puede dejar desactualizado el stock que un listing Mercado Libre debería exhibir. La intención comercial y el hecho de venta son distintos: `SALE_APPLIED` describe una venta ya registrada; `STOCK_DESIRED_CHANGED` describe el último saldo que StoreCore desea publicar para un listing.

Para cada listing ML elegible, StoreCore mantiene una proyección local de versión creciente. El valor es:

```text
sellable = max(0, available_quantity - safety_stock)
```

`available_quantity` ya descuenta reservas activas. Restar de nuevo `reserved_quantity` es incorrecto y queda prohibido.

## Actores

- **Servicio de inventario StoreCore:** origina cambios de saldo bajo operaciones WEB o internas. Un caller ML futuro sólo puede entrar tras binding único y refetch oficial comprobables; no existe caller ML activo en esta feature.
- **Operador interno autorizado:** crea/activa/pausa/remapea listings y resuelve intervención manual; no puede forzar una publicación remota desde este flujo.
- **Cuenta externa Mercado Libre autorizada:** receptora futura de una intención persistida; ninguna llamada a ella es parte de esta feature.

## Reglas de negocio

### BR-DSP-01 — una única fórmula canónica

La proyección por listing usa sólo `available_quantity` y `safety_stock` bloqueados/consistentes en la transacción que cambió el inventario. El resultado nunca es negativo. Una reserva WEB reduce el valor una vez; su release o expiry lo restaura una vez. Consumir una reserva ya descontada puede no cambiar la proyección y no debe fabricar una notificación artificial.

### BR-DSP-02 — elegibilidad de listing y cuenta

Sólo un listing de una cuenta externa ML autorizada, con estado `ACTIVE`, producto y variant activos, capability activa y sin `manual_intervention_required`, puede generar una intención de stock saliente. Listings `DISABLED`, `READ_ONLY`, `PAUSED` o `ERROR`, cuentas no activas o UNCLASSIFIED, producto/variant inactivos y cuentas internas de políticas de precio generan o actualizan un snapshot `WITHHELD` versionado con razón; no generan `STOCK_DESIRED_CHANGED` ni delivery. Si snapshot, razón, mapping y elegibilidad ya coinciden, el resultado es `UNCHANGED`.

No se decide elegibilidad por una cadena literal de `account_key`. El propósito de cuenta/listing será tipado y auditable. Esta regla se limita a los flujos locales de listing/proyección de este WIP; no modifica `notify`, webhook ni ingress existentes.

### BR-DSP-03 — intención diferente de la venta

Un cambio material de la proyección elegible crea un `channel_outbox` inmutable `STOCK_DESIRED_CHANGED`, con una delivery exactamente `PENDING`, en la misma transacción que el cambio de saldo/proyección. Nunca se reutiliza `SALE_APPLIED` para publicar stock ni se infiere una venta desde un mensaje de stock.

La persistencia de una delivery es intención local, no prueba de que Mercado Libre recibió, aceptó o aplicó una cantidad.

### BR-DSP-04 — monotonicidad, replays y coalescencia

Cada listing tiene una versión de proyección estrictamente creciente. Un mismo snapshot (listing, versión, cantidad deseada) es idempotente; un replay no crea otra salida. Si cambia el saldo o el mapping, una nueva versión supera a la anterior.

El outbox es evidencia inmutable, por lo que pueden coexistir deliveries `PENDING` históricas. La coalescencia es lógica: para un listing sólo la salida cuya versión coincide con la proyección actual puede ser elegible para un futuro dispatcher. Una salida de versión menor nunca puede enviarse después de una mayor. Esta feature no implementa ese dispatcher ni altera las deliveries anteriores.

### BR-DSP-05 — transiciones de listing seguras

- **Creación de catálogo/promo:** si crea un listing de cuenta interna de precio, no entra al flujo de stock. Si crea un listing externo, empieza no publicable hasta activación explícita; la activación calcula un baseline y genera la primera intención si es elegible.
- **Activación:** requiere mapping válido a un variant activo, cuenta externa autorizada y ausencia de intervención manual. Genera una versión baseline incluso si el saldo coincide con una foto anterior.
- **Pausa/error/read-only/disabled:** bloquea nuevas intenciones y materializa `WITHHELD` versionado con razón. No se publica automáticamente cero por una pausa: el operador conserva control y la proyección remota no se adivina.
- **Remapeo:** serializa listing, variant anterior y nuevo. El remapeo nunca conserva como vigente una intención calculada para el variant anterior: marca `manual_intervention_required`, registra auditoría y bloquea la generación hasta una confirmación humana explícita. Esa confirmación genera un baseline con la nueva versión.
- **Intervención manual:** sólo la resolución auditada por operador puede limpiar el bloqueo; debe explicar motivo y no modifica ventas, ledger ni outbox histórico.

### BR-DSP-06 — snapshots y resultado local

El caso de uso devuelve un resultado local por listing, no un resultado remoto:

| Resultado | Significado |
|---|---|
| `PROJECTED` | se materializó una versión nueva y una delivery `PENDING` |
| `UNCHANGED` | la foto actual ya tiene misma cantidad/mapping y no se generó otra intención |
| `WITHHELD` | listing/cuenta no publicable o requiere intervención; no hay outbox |
| `NO_LISTING` | el variant cambió, pero no tiene listings externos asociados |

El snapshot persistido contiene identificadores internos/externos permitidos, `desiredQuantity`, `projectionVersion`, causa local y timestamp. No contiene token OAuth, PII, payload de venta ni precio.

### BR-DSP-07 — causas que disparan evaluación

La evaluación se integra al mismo límite transaccional de inventario para: reserva WEB desde carrito/checkout, consumo WEB por pago MP confirmado, release WEB explícito, expiración WEB (incluida la reserva MP vencida) y ajuste interno. Un consumo de una reserva que ya descontó `available_quantity` puede resultar `UNCHANGED`, pero también participa en protocolo y rollback. Este WIP **implementa** un `releaseSaga` interno e idempotente: su primer caller es la terminación MP verificada como no pagada. Libera sólo reservas ACTIVE de esa orden/saga, restaura available y reserved una vez, escribe ledger RELEASE y recalcula todos los listings en la misma transacción. Pago pendiente, ambiguo o acreditado no se libera por este comando; no se agrega ruta pública de cancelación. Expiry conserva su propia causa y status EXPIRED. También se evalúa al activar un listing externo o confirmar remapeo. Todas las líneas SKU de una operación se ordenan y confirman o revierten juntas.

`ml-inbox-to-projection` será un WIP futuro, condicionado a contrato oficial de binding único y refetch oficial. Sólo ese WIP podrá definir cómo una venta ML ya aplicada genera `SALE_APPLIED` y, separadamente, solicita esta proyección. Este WIP no invoca inbox ni trata una fila durable como prueba de autenticación; su rollback sólo cubre las unidades WEB, internas y lifecycle que están en alcance.

### BR-DSP-08 — transición de ownership PIC-009 sin doble writer

Las filas inmutables `LISTING_STOCK` que produjo PIC-009 antes del corte siguen como evidencia histórica: no se reclasifican como `STOCK_DESIRED_CHANGED`, no reciben delivery retroactiva y no se borran. El adapter existente no puede considerarse inocuo: bajo su fixture ACTIVE escribe `desired_quantity` y `LISTING_STOCK` post-commit. Por lo tanto, antes de que esta feature habilite el ownership canónico, un puente fail-closed debe retirar esas escrituras directas del adapter y devolver sin efecto mientras el proyector no exista o `BLACKSTORE_INTEGRATION` permanezca `DISABLED`.

El orden es obligatorio: (1) probar que el adapter legacy sellado produce cero mutaciones incluso con activación temporal de fixture; (2) introducir y probar el proyector como único writer local de `desired_quantity`, snapshot y `STOCK_DESIRED_CHANGED`; (3) sólo con GO separado de PIC-005, permitir que el bridge delegado le solicite una causa local. El bridge no activa BlackStore, no agrega HTTP, credenciales, delivery ni caller. Ningún producer nuevo inserta `LISTING_STOCK`.

### BR-DSP-09 — catálogo, estado activo y atomicidad

Un listing sólo es elegible cuando cuenta, listing, producto y variant siguen activos y sin intervención manual. Crear, activar, desactivar o remapear producto, variant o listing cambia esa elegibilidad. JdbcCatalogService.saveProduct no puede confirmar producto o variant activos y luego abrir una transacción distinta para inventario: la mutación de catálogo, setAvailableQuantity, snapshot de proyección, outbox y delivery pertenecen a una única transacción. Si delivery falla, ningún cambio de catálogo ni stock queda confirmado.

Desactivar producto o variant persiste un snapshot WITHHELD con nueva versión y sin outbox. Reactivarlo sólo genera baseline PENDING si además se revalida cuenta externa, listing ACTIVE y capability activa.

### BR-DSP-10 — upgrade, cuarentena y catch-up

Una migración no interpreta desired_quantity histórico igual a cero como stock remoto correcto. Todo listing preexistente queda clasificado como cuenta UNCLASSIFIED y snapshot WITHHELD, sin outbox, hasta una clasificación y reactivación auditadas. Al reactivar cuenta, capability, listing, producto o variant, StoreCore recalcula desde el saldo actual y crea un baseline de versión nueva con delivery PENDING en la misma transacción. No hay publicación automática durante upgrade ni al cambiar sólo la configuración.

### BR-DSP-11 — identidad autenticada de listing e ingress

La creación/activación de un listing recibe account_id explícito de un operador interno autorizado para esa cuenta; StoreCore no elige una cuenta por orden, estado o literal. La proyección local de este WIP recibe account_id sólo desde lifecycle/listing local; no consume inbox ML como caller. El binding de webhook (único, configurado y autenticado) pertenece a un contrato de ingress futuro: ingress sin binding, con binding ambiguo/pausado o evidencia inválida deberá rechazarse antes de persistir inbox o ACK y requerirá refetch oficial antes de aplicar stock, pero esta feature no modifica `notify`, no habilita endpoint ni inventa una firma. Las cuentas históricas sin binding permanecen operativamente deshabilitadas hasta configuración auditada, sin convertir oauth_secret_reference existente en secreto de webhook.

## Criterios de aceptación

- **AC-DSP-01:** con `available=10`, `reserved=3`, `safety=2`, la cantidad deseada es `8`, no `5`; con `available < safety`, es `0`.
- **AC-DSP-02:** reserva de carrito/checkout, consume WEB de MP confirmado, release WEB explícito por terminación MP verificada no pagada, expiry WEB y ajuste interno recomputan todos los listings externos activos de cada variant afectado; consume sin cambio devuelve UNCHANGED y el mismo replay no duplica salida. Release repetido no aumenta available ni añade ledger/outbox; pago pendiente o acreditado no se libera. La operación multi-SKU es atómica y usa orden global de locks que incluye order, attempt y reservas. La aplicación de venta ML queda diferida hasta que un contrato separado pruebe binding único y refetch oficial.
- **AC-DSP-03:** `SALE_APPLIED` histórico y `STOCK_DESIRED_CHANGED` nuevo son kinds distintos y distinguibles; esta feature no prueba ni implementa el caller de venta ML que los correlacionará en el futuro WIP `ml-inbox-to-projection`.
- **AC-DSP-04:** cada `STOCK_DESIRED_CHANGED` tiene una delivery durable `PENDING`; un fallo inyectado en su insert revierte saldo, ledger, reservas, payment/order/attempt y estados WEB o MP, proyección y outbox de todas las líneas SKU de la unidad transaccional.
- **AC-DSP-05:** dos listings activos para un variant reciben proyecciones independientes; dos cambios concurrentes no permiten que una versión antigua quede vigente ni que se envíe después de una más nueva.
- **AC-DSP-06:** listing pausado, cuenta interna de precio o listing con intervención manual no crean intención; activar/confirmar mapping válido crea baseline versionado.
- **AC-DSP-07:** un remapeo no puede reutilizar una intención de variant previo; exige intervención y auditoría antes de volver a publicar.
- **AC-DSP-08:** las pruebas PG16/Testcontainers demuestran rollback, replay y lock estable del snapshot completo action/config/kill; el login runtime con sólo su rol puede ejecutar la función estrecha, pero no DML/DDL directo ni funciones V3 genéricas para ML. Carreras admin contra emisión y consume/release/expiry MP contra reserva multi-SKU terminan sin deadlock ni publicación obsoleta. No usan red, credenciales ni API ML real.
- **AC-DSP-09:** la migración conserva `LISTING_STOCK` histórico sin reinterpretarlo; antes del ownership canónico, la prueba del bridge sellado demuestra cero UPDATE de `desired_quantity` y cero INSERT `LISTING_STOCK` aun en el fixture ACTIVE. Ningún flujo nuevo agrega ese kind y la delegación BlackStore queda bloqueada hasta PIC-005 GO.
- **AC-DSP-10:** upgrade con listing ACTIVE preexistente, desired_quantity cero y saldo positivo crea cuarentena WITHHELD sin outbox; clasificación y reactivación auditada crean un único baseline PENDING calculado desde el saldo actual.
- **AC-DSP-11:** si el insert de delivery falla durante saveProduct, producto, variant, balance, snapshot y outbox revierten juntos; toggles concurrentes de estado no publican una proyección para mapping o variant ya inactivo.
- **AC-DSP-12 (gate externo de ingress):** crear listing sin account_id autenticado no persiste listing. La futura feature de ingress deberá rechazar webhook sin binding único antes de inbox/ACK; este WIP no implementa ni activa webhook y conserva inbox histórico sin inventar binding ni secreto.

## Fuera de alcance

Despacho/lease/retry remoto, OAuth y secretos ML, reconciliación de stock observada, `ml-inbox-to-projection`, pricing automático, scraping/competidores, campañas, nuevas integraciones o pagos live de Mercado Pago, fiscal, feature flags genéricos y migración shared-tenant. Los refactors transaccionales del flujo MP existente y el `releaseSaga` WEB interno exigidos por TASK-DSP-004 sí están dentro del alcance. El sellado local de PIC-009 es sólo una precondición anti-doble-writer; no implementa ni habilita su conector BlackStore.
