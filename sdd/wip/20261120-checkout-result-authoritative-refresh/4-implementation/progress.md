# Progreso

## 2026-11-20

- Se verificó que el resultado productivo relee la orden al entrar pero sólo
  expone retry ante error.
- Se abrió un corte independiente desde `master@878e17e`, sin tocar el branch
  de media ni afirmar pagos live.
- Specs y DAG aprobados para implementación local.
- `PaymentStatus` concentra la regla de actualización: sólo `Pending` permite
  consultar nuevamente; estados terminales y `Unknown` fallan cerrados.
- Un único effect recibe comandos cerrados de carga inicial/refresh. La carga de
  ruta cancela refresh obsoleto; el refresh conserva el snapshot y bloquea
  activaciones duplicadas.
- La pantalla agrega `Actualizar estado`, `aria-busy` y anuncio `aria-live`, sin
  polling ni inferencia desde el retorno del navegador.
- La primera revisión Bugbot detectó que la región viva nacía junto con su
  primer mensaje. Se dejó montada, vacía y accesible desde el render inicial,
  incluso antes de tener una orden, para que el cambio sea anunciado de forma
  fiable.
- La regresión focal posterior a la corrección pasó 16/16.
- Corpus focal: 18/18 verde. Corpus frontend completo: exit 0. `npm run lint` y
  `npm run build` pasaron; build conserva el warning no bloqueante del bundle
  inicial de 708,54 kB frente al presupuesto de 700 kB.
- El gate de arquitectura pasó 9/9 y confirmó la ruta
  Container → View → Store → UseCase → HTTP repository. `git diff --check`
  quedó limpio.
- CRR-003..006 quedan completos. CRR-007 permanece abierto hasta CI alojado,
  dos reviews exact-head, PR, merge y post-merge.
