# Especificación funcional — convergencia POS offline

**Gate vigente:** dos reviews Astra dieron GO documental sólo para preparar POSC-000 y POSC-000A (`sdd/reviews/20260927-pos-convergence-dual-documentary-go.md`). Ambos siguen pendientes; este dictamen no aprueba porteo productivo, Flyway, adapter live ni cierre del WIP.

## Problema y resultado esperado

La línea de integración ya expone el contrato `/blackstore-integration/v1` mediante un adapter monolítico y migraciones V5–V7. La rama de preparación POS desarrolló módulos hexagonales, controles de identidad, catálogo, reserva y lectura de recuperación sobre otra secuencia Flyway V4–V7. Copiarla completa haría que un número de migración publicado significara dos cosas y registraría dos handlers para las mismas rutas.

El resultado de esta convergencia es **una** implementación offline de un contrato adjudicado en integración, con la historia existente preservada y evidencia reproducible en una instalación limpia y una existente. Hoy hay dos contenidos YAML bajo `1.0.0-draft`: la copia integrada que BlackStore tiene pinneada y una copia dirty más reciente con cambios de wire. Hasta decidir su compatibilidad y digest, no se portean DTOs, endpoints ni transporte. La cuádruple, el ledger `EXTERNAL_BLACKSTORE`, la lectura read-only de reconcile y la semántica 410 de tombstone permanecen requisitos de negocio; cualquier cambio de wire requiere decisión explícita.

## Reglas de producto

1. Un comercio por VM/base; BlackStore es companion opcional 0..1 en la misma VM y se comunica sólo por API autenticada. No comparte tablas ni conexión de base de datos.
2. La reserva/commit/release de BlackStore mueve stock canónico con una cuádruple por saga. `STOCK_COMMIT_EXTERNAL` no es una venta `SALE` de StoreCore. La venta y caja presencial pertenecen a BlackStore y conservan trazabilidad.
3. `available_quantity` ya descuenta reservas; sellable resta sólo `safety_stock`. Los movimientos WEB, ML y EXTERNAL_BLACKSTORE deben conservar sus ownership y no duplicar decrementos.
4. Recuperación por `GET operations/{operationId}` y reconcile consultan evidencia durable sin escritura. Una tombstone devuelve 410 y nunca autoriza repetir el POST; una ausencia 404 sólo se interpreta bajo las reglas del contrato.
5. Cualquier fallo de identidad, scope, estado de capability, permiso, configuración o topología debe cerrar el acceso. Una ruta nueva o un test offline no activa un companion live.

## Criterios de aceptación de la convergencia

- Flyway conserva exactamente los V1–V7 publicados en integración y agrega sólo versiones posteriores disponibles, revisadas contra `flyway_schema_history`; upgrade con datos existentes y bootstrap limpio terminan en el mismo esquema esperado.
- Cada uno de los siete endpoints contractuales tiene exactamente un handler en el contexto Spring final; la entrega de OpenAPI no se pierde ni se duplica.
- POSC-000A valida el YAML baseline adjudicado con parser OpenAPI 3.1, fixtures por status y digest SHA-256. Es un corte separado de cualquier harness PG16. El PIC-008A histórico de readiness prueba SKU 128/129 del YAML dirty y permanece pendiente/diferido si se conserva baseline 64/65; no se toma crédito de cierre por POSC-000A.
- PIC-006A se ejecuta después de POSC-004A, que introduce la evidencia retry/alert a fotografiar. Prueba sólo GET/reconcile read-only en PostgreSQL 16 por el proxy Spring real con `REPEATABLE_READ`, snapshots completos antes/después y writer concurrente. En el baseline, reconcile acepta 1..500 receipts y deduplica repetidos; 0/501 son inválidos. El rechazo 400 de duplicados pertenece a la evolución dirty/histórica y no se acredita aquí. PIC-006A no certifica commit/release ni recovery mutante.
- El harness de integración separado prueba migraciones limpia/upgrade, idempotencia/concurrencia, reservas/ledger, tombstone, autorización y permisos reales. Todo es offline, sin credenciales ni comunicación live con BlackStore.
- Las piezas de la rama de preparación se portan de modo selectivo sólo tras resolver ownership y dependencias; cada PR pequeño registra evidencia, dos revisiones estrictas y estado SDD honesto. El adapter live requiere un gate independiente posterior.
