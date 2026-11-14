# Spec técnico

Los conjuntos finitos `RouteActor`, `RouteScenario` y `RouteEvidenceMode` son
clases cerradas con constructor privado e instancias estáticas. El manifiesto
reutiliza `SurfaceIdentity`; no introduce strings de estado en vistas o stores.

Un test de arquitectura recorre recursivamente `Routes`, compone patrones y
compara exactamente leaves, redirects y wildcards contra el manifiesto. Falla
ante faltantes, duplicados o entradas huérfanas.

Playwright navega cada URL declarada con fixtures centrales fail-closed: toda
petición inesperada o escritura aborta. Comprueba URL final, `data-surface-id`,
un único `h1`, readiness representativo y axe. Desktop y mobile se cubren sin
reclasificar HTTP simulado como backend real.
