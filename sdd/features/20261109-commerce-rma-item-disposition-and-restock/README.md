# Commerce RMA item disposition and restock

Cierra la inspección física de una devolución recibida con clasificación explícita por ítem y cantidades, reposición vendible segura y resultado durable.

## Resultado

- Tipos cerrados `RESTOCK`, `DAMAGED` y `REJECTED`, con `Unknown` fail-closed en los bordes.
- Sólo la cantidad RESTOCK incrementa `inventory_balances` y genera ledger `RMA_RESTOCK/INTERNAL`.
- Comando final atómico, inmutable e idempotente con recovery por GET después de una respuesta perdida.
- Autoridad USER, CSRF, capability, locks de orden/inventario y revocación concurrente linearizados.
- UX administrativa editar → revisar → confirmar → recuperar, con estado padre sincronizado.
- Históricos incompletos y valores futuros se muestran sin inventar clasificación ni habilitar efectos.

## Evidencia

- Backend completo: 268/268 tests.
- Frontend: arquitectura, lint, 1091/1091 tests y build.
- Browser real: 18/18 journeys sobre PostgreSQL/Spring/Angular HTTPS.
- PR #233 head candidato `fc80316552c5ec3d08e79bac5bdc85d367593810`.
- Verify `42666041072`: backend, frontend y `unified-access-real-e2e` success.
- Doble review GPT-6.1 Sol backend/security y frontend/product: APPROVE sin P0–P3.

No acredita RMA parcial/múltiple, correcciones posteriores, reembolso, ARCA, outlet, carrier, homologación, release ni deploy.
