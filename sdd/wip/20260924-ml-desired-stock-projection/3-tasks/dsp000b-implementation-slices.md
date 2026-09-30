# TASK-DSP-000B — snapshot ML SYNC

**Base:** `origin/integration/storecore-int` `d4137fb` (POSC-005 merge #83). Siguiente Flyway libre: **V15**.

## Qué hace este corte

- Función `marketplace_ml_sync_snapshot()` SECURITY DEFINER, owner `storecore_ml_sync_guard_owner` NOLOGIN, `search_path=pg_catalog,pg_temp`, pareja constante MARKETPLACE_ML/SYNC, FOR SHARE action→config→switches.
- `JdbcCapabilityService.decide` consume esa foto para SYNC dentro de `@Transactional(REPEATABLE_READ)`.
- Entry points V3 genéricos rechazan MARKETPLACE_ML antes de config/switch. EXECUTE V3 sigue revocado a PUBLIC/runtime (V8). Admin ML sigue por Tx-C (action FOR UPDATE primero).
- Runtime **no** recibe UPDATE directo de action/config/switch.

## Fuera

DSP-001..008, dispatcher, red ML, secretos, BlackStore live, fiscal, `sdd.finish`, grant `INSERT(variant_id)`, `git branch --delete-merged`.

## Maven (Luna)

```text
cd backend
mvn -Dtest=Dsp000bMlCapabilityGuardTest,CapabilityTask003Test test
```

Exit 0. PG16 Testcontainers. Flyway V15 SHA LF `4CECD8B7E846E692B025F383CCFB8E7152716B4C93EB5B5945282FA15C8DBC61`.
