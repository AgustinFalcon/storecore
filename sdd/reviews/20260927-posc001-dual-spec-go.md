# POSC-001 — doble review Astra de la propuesta PG16

**Fecha:** 2026-09-27. **Objeto:** `sdd/wip/20260927-pos-integration-convergence/2-technical/posc001-harness-proposal.md` sobre la línea de integración posterior al PR #61 (`3df741c57661649f7c43923db26d0358a24635bb`). Esta revisión es documental: no evalúa una implementación POSC-001 ni evidencia nueva de tests.

## Primer pase: NO-GO y cierre documental

Los dos revisores Astra señalaron cuatro gaps que impedían delegar el harness:

1. **Comparación de instalaciones:** el plan permitía schemas distintos y comparar metadatos variables. La propuesta corregida exige dos bases PG16 independientes con `public`, compara Flyway por `version/script/checksum/success` y normaliza catálogo sin OIDs, tiempos ni IDs dependientes de la base.
2. **Upgrade con datos V1→V2:** V1 exige bcrypt en USER/CUSTOMER y V2 exige Argon2id; sembrar identidades en V1 haría fallar el recorrido positivo. La propuesta siembra primero catálogo/balance/reserva/ledger, migra V2 y recién entonces crea identidades Argon2id. Una tercera base comprueba que bcrypt en V1 detiene V2 por `IDENTITY_LEGACY_BCRYPT_PRECHECK_FAILED` sin pérdida ni `repair`.
3. **Fixtures V5/V6 válidas:** la propuesta mantiene la capability y el companion `DISABLED`, usa credencial sintética `ACTIVE` no resoluble o `REVOKED` con timestamp, y exige PENDING/RESERVED/terminal/tombstone ajustados a constraints reales, incluido `result_body NULL` donde está permitido.
4. **Carreras observables:** el harness deberá consumir todos los `Future` con timeout, limitar excepciones a errores de negocio previstos, cerrar el executor en `finally`, verificar conteos exactos de ledger/saldo/reserva y replay de commit sin otro decremento. Un fallo inesperado sintético debe hacer fallar al verificador.

## Veredicto final y límite

- **Astra A:** GO documental final para implementar POSC-001 como PR test-only tras los cuatro ajustes.
- **Astra B:** GO documental final independiente con el mismo alcance.

`TASK-POSC-001` pasa a `ready_for_implementation`; el WIP permanece en **2/9 done** hasta que el harness exista, ejecute sus pruebas PG16 y pase reviews de código. El GO no autoriza código productivo, DDL/Flyway nuevo, revocación de ACL, rol/worker nuevo, porteo de handlers, activación BlackStore ni conector live. Tampoco acredita PIC-008A, PIC-006A o POSC-004A. El Verify alojado del PR #61 tuvo `steps=[]`; esta review no lo presenta como CI verde.
