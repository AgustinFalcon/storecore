# Progreso

- 2026-11-22: auditoría de superficies y flujos completada por dos agentes GPT-6.1 Sol.
- 2026-11-22: specs funcional/técnica y plan creados.
- Riesgo abierto: `READY_FOR_PICKUP`/`PICKED_UP` no deben incorporarse al overview hasta corregir la proyección que hoy los considera contradictorios.
- Riesgo abierto: escenarios pagados requieren importador de evidencia local; no se falsificarán estados.
- 2026-11-22: contrato V3 y generador determinista implementados: 80 productos, 12 ofertas (4 draft/4 active/2 paused/2 ended), 7 bloques, 3 direcciones, 5 líneas/9 unidades de carrito y 12 favoritos.
- 2026-11-22: `showcase:test` 106/106, incluido marcador explícito `PENDING`, reanudación con Home preexistente y preservación de una pausa/vaciado manual posterior; Angular 1621/1621, lint, arquitectura, manifest y build aprobados.
- 2026-11-22: matriz Demo Chromium comprador/administrador 335/335 aprobada en 18,5 minutos (desktop, móvil, teclado y Axe).
- 2026-11-22: el gate productivo se migró del fixture reducido de 40 productos al V3 integral de 80 y ahora exige conteos PostgreSQL exactos para catálogo, stock cero, Home, ofertas, direcciones, carrito y favoritos. `check:psd-real` y lint aprobaron localmente; falta ejecutar el runner Linux completo sobre este cambio.
- Bloqueo local: `test:productive-routes-real` exige Linux no-root con Node/Java/PostgreSQL 16 y firewall por UID; WSL local no tiene esas dependencias. GitHub Actions sí provee el runner, por lo que la evidencia PostgreSQL del V3 queda condicionada a su próximo resultado verde.
- 2026-11-22: el primer runner Linux V3 cargó y verificó correctamente los 80 productos y todos los conteos PostgreSQL, pero el navegador detectó tres defectos del gate al crecer el dataset: readiness acoplado al primer SKU en listas paginadas, carriles de productos desplazables sin foco de teclado y eliminación concurrente de 12 favoritos sin esperar cada confirmación HTTP.
- 2026-11-22: se reemplazó el readiness frágil por estructura poblada y se conservaron las aserciones exactas en PostgreSQL/API; los carriles ahora son regiones enfocables con nombre accesible y el flujo de favoritos espera cada `DELETE`. Verificación local posterior: arquitectura 9/9, smoke 3/3, Angular 1621/1621, lint, build y `check:psd-real` 126 casos descubiertos.
- 2026-11-22: el segundo runner aceptó las 90 rutas y dejó sólo tres fallas del mismo test por solicitar `size=100` contra el contrato cerrado de paginación `1..50`. La evidencia de inventario ahora consulta las páginas 0 y 1 de 50, exige total 80 en ambas y concatena exactamente 80 filas.
