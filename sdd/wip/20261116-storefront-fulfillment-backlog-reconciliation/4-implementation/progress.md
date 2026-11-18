# Progreso — reconciliación #8/#13

## 2026-11-16

- Dos auditorías GPT-6.1 Sol leyeron master/PR #282 y compartieron resultados.
- #8: checkout local, snapshot, order/shipment split y pickup sin SHIPPED están
  implementados; carrier y emails permanecen deferred.
- #13: shell/PDP/branding/cart CUSTOMER/checkout/resultado local existen; guest
  cart fue sustituido por intención+login+confirmación y MP return live sigue WIP.
- Specs y matriz de siete tareas creadas sin cambios runtime.
- Base apilada deliberadamente en #282; pendiente review antes de abrir PR.
- Primera review coordinada detectó baseline canónico obsoleto y un consumidor
  Angular mal atribuido; ambos se corrigieron antes del commit.

## 2026-11-18

- PR #282 se fusionó como `214140d`; Verify `44320781327` y post-merge
  `44323153644` terminaron 5/5 verdes y #106 quedó cerrado.
- PR #285 fue actualizado con `master dc32a3e` y retargeteado de la rama padre a
  `master`; el stack sobre #282 queda como antecedente histórico verificable.
- La revisión posterior al retarget detectó referencias canónicas obsoletas; se
  actualizaron STATUS, RELEASE, TRACEABILITY, meta, spec y tareas sin cambiar
  runtime ni cerrar #8/#13.
- Pendiente: reviews exact-head y CI del SHA final; después, merge, post-merge y
  comentario honesto de residuales en #8/#13.
