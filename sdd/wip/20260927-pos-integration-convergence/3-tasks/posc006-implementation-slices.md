# POSC-006 — PIC-006A GET/reconcile read-only

**Estado:** 004A merge `#81` (`1dbad5d`). Este corte **no cambia** código productivo, Flyway, ACL, `pom.xml` ni config compartida.

## POSC-006 / PIC-006A

- **Estado:** dual prv24 APPROVED (`sdd/reviews/20260930-grok-prv24-sdd.md`, `sdd/reviews/20260930-grok-prv24-scope.md`) @ `53d48cb`. PR pendiente.
- **Dependencia:** 004A mergeado (`1dbad5d`).
- **Ownership:** tests PG16 por contexto Spring real (`@SpringBootTest` + `TestRestTemplate`) sobre los handlers ya existentes `GET /operations/{operationId}` y `POST /operations/reconcile`. El engine Spring-wired aplica `TransactionTemplate` REPEATABLE READ + `readOnly` (no hay `@Transactional` en el service/controller; **no se agrega** aquí). El test refleja ese campo del bean y prueba cero writes por HTTP.
- **Aceptación observada:** GET 404 / PENDING 200 / durable 200 / tombstone 410; reconcile 0 y 501 → 400 `VALIDATION`; 500 unknown 200; duplicados del baseline aceptados/deduplicados; header de client ajeno → 403 `FORBIDDEN` (requireOwned); companion `REVOKED` → 401 `UNAUTHORIZED` en el filtro de bearer **antes** de leer receipts; snapshots de saga/líneas/tombstone/ledger/reservas/audit/outbox/inbox iguales antes y después de GET/reconcile; writer concurrente en `inventory_balances` no altera esa fotografía. 400 por duplicados del YAML dirty queda diferido.
- **Fuera:** commit/release/purge (ya 004/004A; el test sólo los usa como fixture de 410), POSC-005 wire, fiscal, live, `sdd.finish`, ML RR.

## Maven (Luna, PIC-006A)

```text
cd backend
mvn -Dtest=Posc006aGetReconcileRoTest test
```

| Attribute | Record |
| --- | --- |
| Exit code | 0 |
| Tests | 1 run, 0 failures |
| Flyway ceiling | V14 |
| PG | 16 via Testcontainers SpringBootTest |
| Production/Flyway/ACL/pom diff | none |

No se acredita POSC-005, commit/release/purge, fiscal, live, ni `sdd.finish`.
