# Revalidación de completitud frontend — 2026-11-06

Base auditada: `master` en `335c50f4fa4ab7901ad1df419043edc03b01f735`.
Alcance: StoreCore frontend Demo y build productivo; sin proveedores reales,
deploy ni homologación.

## Inventario contrastado

Se reconciliaron las 26 superficies de `delivery-manifest.json`, las rutas Demo,
las rutas productivas, los estados cerrados y la matriz global de CTA. El demo
vendible conserva cobertura de comprador y administración para descubrimiento,
acceso, cuenta, favoritos, compra, checkout, pedidos, postventa, contenido,
productos y variantes, ofertas, campañas, clientes, inventario, Mercado Libre y
competencia simulados, módulos y configuración. Las superficies que siguen sólo
en Demo están declaradas como tales y no se presentan como integración real.

## Hallazgo y corrección

La primera repetición del gate detectó una carrera del propio auditor global al
reordenar banners y categorías de SC16. El producto reordenaba correctamente,
pero el selector posicional de Playwright podía resolver el nodo anterior antes
de que Angular terminara de moverlo y esperar luego sobre un control que ya era
el extremo deshabilitado.

`cta-matrix.spec.ts` ahora espera el cambio de cardinalidad y sigue banners y
categorías por su identidad estable (`data-banner-editor` /
`data-category-editor`) antes de accionar el movimiento inverso. No se agregó
espera temporal ni se omitió ningún CTA.

La repetición de `verify` encontró además una lectura no determinista en el test
unitario de SC15: el `BehaviorSubject` emitía el rango semanal y la aserción podía
leer la señal Angular antes de su propagación. El test ahora espera el caso
cerrado `OverviewRange.Week` antes de validar la proyección; el componente y su
contrato no cambiaron.

## Evidencia ejecutada

- `npm run verify` final: PASS — arquitectura 7/7; lint PASS; 134 archivos y
  988 pruebas PASS; build productivo PASS.
- SC15 focal posterior: 1 archivo / 2 pruebas PASS.
- Primera matriz completa: 332/334 PASS; los dos reportes rojos derivaron del
  mismo timeout SC16 y del `afterAll` global reiniciado tras ese fallo.
- Reproducción aislada previa a la corrección: FAIL determinista sobre el
  selector posicional.
- Navegador real: el banner agregado se movió de posición 2 a posición 1 y su
  acción inversa quedó habilitada, confirmando que la función era correcta.
- Reproducción aislada posterior: el cuerpo SC16 terminó en 2 s; el `afterAll`
  filtrado falló como era esperable porque no se ejecutó el resto de la matriz.
- Matriz CTA completa posterior: **28/28 PASS en 3.8 min**; el `afterAll`
  confirmó que no quedó ningún CTA renderizado o estático sin escenario.
- Matriz Demo completa sobre el source final: **334/334 PASS en 16.4 min**.

## Conclusión honesta

No apareció una funcionalidad base frontend omitida dentro del alcance Demo
aprobado. El frontend demostrable permanece completo localmente para las 26
superficies. Backend productivo, CI remoto, credenciales, OAuth, pagos, ARCA,
carrier, sincronización real, deploy y homologación permanecen fuera de este
corte y no se infieren de estos resultados.
