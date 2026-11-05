# StoreCore frontend R8 — cierre global de composición

Estado: propuesta para review. Base `1c58cf7`. Complementa los contratos SC01–26 y
resuelve brechas globales confirmadas; no habilita integraciones externas ni backend.

## Lote A — identidad y recuperación global

- Cada superficie SC01–26 expone una identidad canónica observable sólo en los targets
  declarados por `targetApplicability`/`productiveBindings`. No se crean rutas Real para
  SC03/09/18/26 u otra superficie Demo-only. La identidad vive en el host, no se
  infiere por un `h1` ni por URL; hay exactamente una activa con URL, actor y datos.
- Demo y Real renderizan una pantalla Not Found explícita para rutas desconocidas,
  mantienen la URL solicitada y ofrecen recuperación segura contextual. No redirigen
  silenciosamente a Home.
- Not Found es un estado cerrado y no imprime rutas o wires como capacidad válida.
- Smoke tests exigen URL final e identidad; la matriz responsive incluye las 26
  superficies y usa un `ORD-*` canónico para SC21.
- Se prueban `/demo/no-existe`, `/no-existe`, rutas anidadas desconocidas y entidad
  inexistente como casos distintos. Not Found usa identidad propia y nunca SC01.

## Lote B — decisión de compra y accesibilidad buyer

### SC04 Catálogo

- Añade filtro cerrado visible `Todos`, `Nuevo`, `Outlet`, `Reacondicionado`, `Usado`;
  el tipo también tiene `Unknown`, no seleccionable. Traducción única desde wire.
- Proyecta dos ejes sin fusionarlos: `kind` Standard/Outlet y condición física
  New/Refurbished/Used/Unspecified. Outlet coincide por `kind` cualquiera sea su
  condición; Nuevo/Reacondicionado/Usado coinciden por condición y pueden incluir
  Outlet. Unspecified sólo aparece bajo Todos; Unknown falla cerrado.
- El filtro participa de URL/round-trip, chip removible, paginación y retorno PDP.
- Unknown no se muestra como condición válida ni amplía resultados.

### SC05 Producto

- Junto al bloque de compra se muestran información simulada y honesta de entrega o
  retiro, medios de pago Demo, ayuda y especificaciones concretas del producto.
- No se cotiza transporte, no se promete disponibilidad real ni homologación. Los CTA
  llevan a pasos existentes o abren información accesible; ninguno es decorativo.

### SC07 Perfil

- Demo añade cambio de contraseña simulado con contraseña actual/nueva/confirmación,
  validación, confirmación, éxito/fallo y limpieza de valores. Como Demo no conserva
  secretos ni puede verificar la contraseña actual, lo declara antes de confirmar y
  acepta formato mínimo sin afirmar autenticación. No persiste clave ni marcador, no
  afecta login, sesiones, recovery o SC26 y no produce Conflict/Uncertain ficticios;
  cancelar/logout destruye todos los valores RAM.
- Real no inventa endpoint: comunica la indisponibilidad y conserva recuperación como
  flujo separado. El cierre global no afirma cambio Real implementado.

### SC10 y SC07 errores

- Cantidad de carrito y campos de perfil asocian error adyacente con `aria-invalid` y
  `aria-describedby`. El error identifica la línea/campo y el foco va al primer error.
- Se cubren cambio de precio/oferta expirada y producto no disponible sin eliminar la
  línea silenciosamente.

### Checkout Real

- Elimina copy de implementación e idempotency key de la vista comprador.
- Muestra total de mercadería derivado del contrato existente y lenguaje comercial;
  separa entrega no calculable sin inventar una tarifa.

## Lote C — continuidad operativa

### SC15 incidencias

- Tarea, contador y alertas usan una única proyección cerrada de incidencia compartida
  con SC20/21. `ORD-1019` se prioriza como incidencia abierta.
- Solicitudes posventa enlazan al detalle SC21 aplicable; se elimina copy que declare
  pendiente una capacidad ya presente.

### Compra nueva → administración

- La cola SC20 conserva sus doce fixtures canónicos y proyecta todos los pedidos del
  snapshot autorizado mediante un origen cerrado persistido/migrado: Canonical,
  Legacy o Unknown. Los `DEMO-100..102` existentes y compras nuevas son Legacy; no se
  deduce autoridad por prefijo. Unknown queda visible y sin comandos.
- Una compra nueva aparece en la cola, se puede buscar/abrir y vuelve a la misma cola.
  Su detalle legacy se identifica honestamente; no se le inventan aftercare/fiscalidad.
- Export, filtros y conteos incluyen esos pedidos según los mismos estados cerrados.
- Sólo Canonical conserva comandos SC20; Legacy navega a su detalle honesto y Unknown
  es read-only. Esto supersede la exclusión de consulta de SC20 R7.2 sin cambiar sus
  doce fixtures, transiciones ni autoridad Admin/Operator.
- El E2E usa navegación natural checkout→resultado→admin queue→detalle→queue; no entra
  por URL directa para ocultar el listado.

## Lote D — estados buyer explícitos

- SC08 demuestra borrado bloqueado sólo cuando un pedido nuevo del mismo actor conserva
  `addressId` estable. Checkout guarda esa referencia opcional al elegir dirección.
  Pedidos históricos sin referencia, pickup, otro actor o igual texto no bloquean; un
  cambio posterior del texto no rompe el vínculo. Se prueba reload y recuperación.
- SC09 permite añadir favorito disponible al carrito y explica producto no disponible.
- SC10 demuestra revisión de cambio de precio/oferta vencida antes del checkout.
- No se agrega sincronización remota; todo queda en ledger Demo y disclosures visibles.

## Autoridad, dominio y persistencia

- Todo conjunto finito usa tipo cerrado con `Unknown` y único `fromWire`.
- Cada paso de flujo es un objeto; UI/store/tests no comparan strings mágicos.
- Se preservan writer/CAS/readback, actor/sesión y no replay ya aprobados.
- Los lotes no modifican contratos Real de escritura ni afirman backend disponible.

## Gates

1. Unit/component por lote y regresiones cruzadas.
2. Playwright owner de cada superficie afectada y recorrido natural buyer→admin.
3. Inventario final `N >= 304` descubierto con `--list --reporter=list`; ejecutar N/N,
   cero skipped/unexpected/flaky y registrar conteo por archivo. Luego Real `test:a11y`
   separado (baseline 35), evaluando todas las violaciones A/AA aplicables y no sólo
   serious/critical.
4. Baseline global 26×3 en Demo más 320/texto 200 % y estados/diálogos aplicables;
   teclado/foco/errores y axe para superficies tocadas. El smoke no sustituye G5.
5. Builds Demo/Real, CTA global, 404 exacto, roles y persistencia/reload.
6. Owners nuevos para SC07/08/09/10, inventario CTA incluyendo controles móviles,
   verify/builds y doble review técnica/UX Astra 0 P0-P3 antes de cerrar el corte.

## Fuera de este corte

- Integraciones reales, homologación, variantes de stock independientes, publicación
  rica SC16 y cambios de contraseña Real sin endpoint.
- Cualquier deuda fuera se documenta explícitamente; no se declara implementada.
- Esta aprobación sólo habilita implementación provisional. G2, G5 global, G6
  UI/UX/PO y reviews exact-SHA siguen abiertos hasta su propia evidencia; Astra local
  no sustituye las dos reviews Sol exigidas antes del merge.
