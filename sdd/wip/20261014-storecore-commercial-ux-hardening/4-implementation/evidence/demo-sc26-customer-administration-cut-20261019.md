# SC26 — Administración Demo de clientes

> HISTÓRICO / SUPERSEDED para la promoción SC26 del 2026-10-27. Este documento
> describe otro corte y no certifica el runtime de la base `c1af13d7968c9d39ca6c27d99ff47925b046c5ba`.
> La promoción actual usa snapshot comercial v2 y Web Locks, sin journal de eventos
> paralelo. Ver `demo-sc26-customer-administration-cut-20261027.md` para evidencia
> ejecutada y límites actuales; no reutilizar los conteos ni reviews de abajo.

Fecha de cierre local: 2026-10-19 (America/Buenos_Aires).

## Alcance verificado

- Ruta exclusivamente Demo `/demo/user/customers`, sin endpoint ni mutación Real inventada.
- Listado, búsqueda, filtros, vacíos, detalle, domicilio ficticio y pedido canónico `ORD-1015` para `customer-2209`.
- Admin puede restringir/reactivar con motivo y confirmación; Operator sólo consulta; Unknown no recibe datos.
- Una restricción revoca la sesión de esa cuenta sin borrar perfil, carrito, historial, devoluciones ni reembolsos.
- Estados, filtros, fases, roles y efectos de sesión son tipos cerrados; el wire desconocido se traduce a `Unknown`.

## Persistencia y concurrencia

- Las transiciones de cuenta se guardan como eventos atómicos e inmutables con epoch monotónico separado del snapshot comercial.
- El mayor epoch es autoritativo y `Restricted` domina empates. Una pestaña atrasada no puede reactivar ni declarar éxito para un evento ignorado.
- La autoridad se verifica antes y después del commit. Un fallo de lectura posterior se comunica como `guardado; confirmación pendiente`, sin afirmar rollback.
- Persistencia corrupta no restaura sesiones contra el seed. `Restablecer` reemplaza primero el snapshot y sólo después limpia eventos, por lo que un fallo no pierde una restricción existente.
- Regresiones cubren primera escritura concurrente, dos administradores, epoch atrasado, fallo precommit, fallo postcommit, revisión separada, sesión restringida y reparación explícita.

## Evidencia ejecutable

- Arquitectura: **6/6 PASS**.
- ESLint: **PASS**.
- Unitarias completas: **141 archivos / 631 tests PASS**.
- Build productivo: **PASS**, 729.89 kB raw / 158.57 kB estimado para `main`; total 748.61 / 162.03 kB.
- Unitarias focalizadas SC26: **4 archivos / 28 tests PASS**.
- Playwright SC26: **5/5 PASS**; lista y confirmación a 390/768/1440, Axe sin violaciones en el diálogo y sin overflow horizontal.
- Capturas: `frontend/test-results/customers-sc26-*` (`customers-*` y `customer-confirm-*`).

## Reviews

- GPT-6.1 Astra Bugbot: **APPROVE**, 0 P1/P2.
- GPT-6.1 Astra Security: **APPROVE**, 0 P1/P2.
- GPT-6.1 Astra UX/Product: **APPROVE**, 0 P1/P2 propios tras inspeccionar seis capturas responsive.

No se creó commit, PR, merge ni publicación. El gate Stitch continúa separado y no se declara aprobado.
