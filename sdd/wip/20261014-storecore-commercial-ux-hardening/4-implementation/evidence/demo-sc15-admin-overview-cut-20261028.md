# SC15 — Resumen administrativo Demo

Base `76813cd`. Estado `verified_local` sobre el delta sin commit, tras los gates registrados abajo. GO del padre: Admin y Operator leen las mismas métricas de la instalación, sin ampliar permisos de destinos. TASK-013 global sigue pending. No backend, esquema, proveedor ni escritura automática.

## AC y decisiones de corte

- Dominio puro por pasos Authorize → SelectPeriod → ProjectMetrics → ProjectCurrentWork; todos los conjuntos finitos cerrados y boundary único fromWire/Unknown. Vista dedicada, no ampliar monolito.
- Período de pedidos All/últimos7/30 días civiles BA, referencia de reloj capturada una vez al entrar y visible; sin tendencias. Fecha estricta SC13 reutilizada, Unknown fuera de acotados y contada; All incluye Unknown sin inventar fecha. Orden estable, Unknown al final. Query inválida visible recuperable, back/reload conservan rango.
- «Total de pedidos acreditados»: sólo órdenes coherentes Approved de SC12; fecha corresponde a creación, no a acreditación. Total histórico incluye entrega, no descuenta reintegros; moneda ARS del contrato Demo, no moneda inferida de una orden. Overflow/incoherencia no produce cifra falsa. Payment Unknown y fechas sin información son hechos separados, no ceros inventados.
- Pendientes actuales, stock, clientes y aftercare NO se recortan por período de pedidos. Stock neto onHand-reserved y umbral configurado, archived no se vende. Cuentas por estado cerrado. Return/refund separados del pago; legacy devuelta no certifica montos. No operaciones de reintegro/aprobación en dashboard.
- Trabajo primero, métricas después, distribución de pagos como barras acompañadas por tabla/números accesibles. Incidencia legacy lleva al pedido exacto; consultas/solicitudes del ledger se resumen read-only aquí, sin prometer que AdminOrder legacy las gestiona ni cruzar a CUSTOMER.
- Links rápidos existentes filtrados por rol, permiso efectivo de ruta y módulos habilitados. Operator sólo content/customers/AdminOrder existentes; sin enlaces a configuración/integraciones/editores bloqueados. Módulos pausados no borran histórico, pero no ofrecen CTA operativo inaccesible.
- Estados poblado/vacío/sin datos/urgente/Unknown/acceso denegado/corrupt-storage sin seed fallback. Read/filter/navigation/shell no escriben. Entry y cambio autoridad enfocan h1 sin robar foco al filtrar o cambiar scenario.
- Responsive320/390/768/900/1440, text resize200% real, teclado/Axe, money indivisible sin overflow. Tablas conservan labels y semántica; CTA por entidad verificadas. No incremento seed necesario inicialmente.

## Plan y evidencia pendiente

1. Tipos/rango/policies/presenter y unit adversariales.
2. Componente+UI dedicada, ruta y CTA inventory.
3. Owner browser con métricas exactas, rangos/fechas, acceso/módulos, readonly/no writes, responsive/Axe/200%.
4. Focal, verify, owner, CTA y full Demo. Registrar resultados reales, fallos y límites; dos reviews exact-SHA/CI aparte, no declararlas realizadas por el autor.

## Implementación y checkpoint local

`demo/overview` separa tipos/rangos/acciones, pasos puros y componente dedicado. El router Demo conecta SC15 sin modificar Real. Se elimina el bloque dashboard obsoleto del template monolítico. La referencia se captura una vez al crear el componente; el tipo de fecha SC13 amplía comparación de ventanas civiles y etiqueta de inicio, sin un segundo decoder de fechas.

El trabajo muestra todas las tareas, prioriza incidencia → revisión → pendiente → preparación → entrega y conserva cronología estable dentro del grupo. Recientes usa fecha estricta y Unknown al final. Admin y Operator reciben mismos números; Operator sólo tiene content/clientes/detalle directo de pedido autorizados por el stack. Los accesos de módulos exigen exactamente un registro con enabled===true, no truthiness ni duplicados contradictorios.

Los reintegros usan `RefundSummaryStep`/`AftercareEligibilityStep` de SC14 por pedido; outcome/estado/razón/evento/variante Unknown y legacy devuelta no se convierten en dinero conocido. La cifra de pedidos acreditados sigue siendo el total histórico bruto, no neto. Las consultas aftercare sólo se expanden para lectura en el resumen, no se enlazan a un detalle legacy que no las gestiona.

Primera focal11PASS; ampliada a12 tests propios dentro de verify. Verify final (antes de restaurar link público de preview, cambio sólo de template) PASS: boundary6, architecture, lint,91 archivos/574tests y buildReal `2026-10-28T17:27:46.751Z`. Owner10/10PASS17.2s: métricas canónicas23200000 minor units/bruto y8450000refundseparado, URL/back/reload, fechasUnknown, tarea antigua después de5 paraOperator, Unknown refund, roles/módulos, vacío/corrupt y5widths/Axe/text2x. Todo con storage sin mutación.

No se reutiliza evidencia histórica como gate nuevo. Intentos iniciales fallaron: faltaba node_modules (junction local existente, sin instalar dependencias); contraste heredado de th (override contraste); expectativa de foco shell sin enfocar primero (setup corregido conservando assertion); cantidad Unknown esperada1 cuando fixture tenía DOS pedidos distintos desconocidos (se afirma2); y CTA existente admin-store-preview faltante en primer componente dedicado (restaurada, sin quitar test). La matriz CTA inicial14/16 falla por ese timeout y afterAll en cascada tras reinicio del worker; nueva corrida completa en curso. Los hallazgos P2 de reviewers (promesa de filtro inexistente, slice5, tabla minwidth620, anchor basehref y divergencia del resumen SC14) fueron corregidos con regresiones. Full Demo final y reviews exact-SHA/CI pendientes en este checkpoint.

Checkpoint posterior: matriz CTA completa **16/16 PASS** (1.6 min), con inventario estático del nuevo template y acciones dinámicas por pedido/tarea; ningún CTA omitido. Verify sobre template final **PASS**: 91 archivos / 574 tests, boundary 6/6, architecture scan, lint y build Real `2026-10-28T17:31:23.157Z`. Full Demo 145 en curso; build Demo PASS `2026-10-28T17:31:49.886Z`. Ningún gate remoto, review exact-SHA ni cierre global se atribuye a este checkpoint.

## Cierre local final

- `npm run verify`: PASS sobre el código final, 91 archivos / 574 tests; boundary 6/6, arquitectura, lint y build Real. Los 12 tests SC15 cubren tipos/borde, autorización previa a getters adversariales, ventanas BA, fechas Unknown/futuras, ties estables, importes incoherentes/overflow, permisos/módulos duplicados y foco reactivo sin robo por filtros/scenario.
- `npm run test:demo`: PASS; build `2026-10-28T17:31:49.886Z`. Suite completa **145/145** (5.2 min), start `2026-10-28T17:31:50.625Z`, duración `311325.409ms`, 0 skipped/unexpected/flaky, retries=0. Incluye nuevamente owner SC15 10 y matriz CTA 16. `frontend/demo-playwright-report/results.json` y `.last-run` passed/failedTests vacío comprobados.
- Capturas finales: `frontend/test-results/overview-sc15-SC15-respons-3565e-xe-and-real-text-resize-320/overview-320.png`, carpeta equivalente para 390/768/900 y `...-43830-e-and-real-text-resize-1440/overview-1440.png` / `overview-text-200-percent.png`. Autor inspeccionó 320 y 200%: dinero íntegro, tabla sin desborde, sin solape. Owner valida cinco anchos con Axe sin violaciones y ampliación real de font-size 2x (no sólo cambio de viewport); no certifica WCAG global.
- `git diff --check` PASS; tareas JSON válido. Sin instalación de paquetes, cambio de seed/schema, backend/Real, autoescritura ni operación financiera. No commit/push.

Lectura/filtrado/URL/back/reload/scenario conservan snapshot byte-exacto en owner. Admin y Operator comparten lectura del comercio, pero no permisos de destinos. Las consultas/solicitudes son informativas: ninguna aprobación, recepción, reintegro, fiscalización ni proveedor se activa aquí. El dashboard no completa SC21 operacional ni el contrato Real de métricas.

Las dos reviews exact-SHA y CI continúan pendientes; la revisión provisional de fuentes/capturas no las reemplaza. TASK-013, diseño/global visual y WIP siguen abiertos. No `/sdd.finish` ni archive.
