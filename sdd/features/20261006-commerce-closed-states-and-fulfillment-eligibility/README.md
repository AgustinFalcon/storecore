# Commerce closed states and fulfillment eligibility

Cierra estados comerciales y elegibilidad de fulfillment con tipos cerrados, evidencia durable y autorización fail-closed.

## Resultado

- Despacho únicamente con pago acreditado y stock consumido verificables.
- Transiciones de shipment y RMA cerradas; Unknown falla cerrado.
- Recepción RMA única sin reposición implícita.
- Locks order-first, carreras y pérdida de respuesta cubiertas.
- TODO-045 conserva disposición/restock por ítem como feature separada.

## Evidencia

- PR #231 head `9108798`; Verify #594 (`42538029894`).
- 1061 tests frontend, 253 backend.
- 17 escenarios browser: 4 CFE reales, 1 Unknown MockHttp, 12 acceso.
- PostgreSQL 16 y migraciones clean/upgrade.
- Close-out candidato `4debf9b`: Verify `42653866473` 3/3 success.
- Doble review GPT-6.1 Sol: APPROVE.

No acredita homologación, proveedores live, release o deploy.
