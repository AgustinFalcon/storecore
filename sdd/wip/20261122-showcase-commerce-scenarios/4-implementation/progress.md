# Progreso

- 2026-11-22: spec funcional/técnico y matriz de nueve escenarios definidos sobre el dataset V3 ya fusionado.
- 2026-11-22: el corte depende del soporte de overview para retiro de PR #351; se desarrolla apilado y no se fusionará antes de ese prerrequisito.
- 2026-11-22: se preserva la cadena checkout real → proveedor oficial local → webhook firmado → worker real → aplicación comercial; quedan prohibidos inserts directos de autoridad.
- 2026-11-22: proveedor local con journal JSON atómico, estados cerrados, hash canónico por idempotency key, rechazo de payload divergente y restauración después de reinicio. Test de proceso real: 1/1.
- 2026-11-22: coordinador separado implementado con pasos de preflight, identidad, checkout, acreditación firmada, fulfillment, RMA, readback y recibo. Cada escenario conserva el comando original y reanuda sólo desde un prefijo durable válido.
- 2026-11-22: dataset comercial completo validado con 80 productos, 12 ofertas, 7 bloques de home, 12 favoritos, 5 líneas de carrito, 3 domicilios y nueve pedidos operativos (19 unidades; 17 acreditadas y 2 reservadas).
- 2026-11-22: runner aislado ejecuta loader V3 con adapter desconfigurado, reinicia al adapter oficial loopback, carga los nueve recorridos dos veces y exige recibos byte-equivalentes. No se relajó `externalSafety`.
- 2026-11-22: gate real final con JAR recompilado al código actual: 6/6 Playwright/SQL. Verifica catálogo/búsqueda, nueve detalles de comprador con reload, listado/cola admin, inventario/ofertas/overview, devolución mixta y grafo exacto de autoridad.
- 2026-11-22: conteos exactos scoped: 9 órdenes/pagos/intentos; 8 acreditaciones/aplicaciones; reservas consumidas 8/17, activa 1/2; SALE 8/-17; 17 eventos; shipments PENDING2/PREPARING1/SHIPPED1/DELIVERED3/READY_FOR_PICKUP1/PICKED_UP1; 2 devoluciones; 1 disposición; RMA_RESTOCK +1.
- 2026-11-22: gates estáticos/locales: `showcase:test` 108/108, proveedor durable 1/1, TypeScript y listado Playwright 29/29. Recibo: `frontend/ua-real-results/showcase-commerce-receipt.json`, digest `40eef65ac3d30ee6f35dc10aa9e3db05f2e1efd5ddfad1bbd8b96b4379b97bca`.
