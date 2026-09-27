# POSC-000 — doble review Astra del ADR contractual

**Fecha:** 2026-09-27. **Objeto:** `sdd/wip/20260927-pos-integration-convergence/2-technical/adr/ADR-001-contract-adjudication.md`, frente al contrato integrado `1.0.0-draft`, la copia servida, el pin BlackStore y el worktree readiness sólo lectura. Base de adjudicación `73367fa8711ac1d2e95397ec25c98eb9e20d7ad9`; snapshot revisado sobre `b6f37df5b9f1ef41e2af194f08a457a25fdcc2c5`. La rama documental actual parte de `d6a30832112064ca08300126ea568ccaaf7f784c` tras #58 (documentación LT5); el rango desde `b6f37df` no cambió archivos POS contractuales ni Flyway.

## Veredictos

- **Astra A:** GO final documental para ADR-001/POSC-000, sin P0–P3 abiertos. En el primer pase pidió precisar la separación entre fixtures de schema POSC-000A y deduplicación efectiva PIC-006A; el ADR corregido la expresa.
- **Astra B:** GO final documental para ADR-001/POSC-000, sin P0–P3 abiertos. Su primer pase fue NO-GO por ownership histórico de reservas, receipts `result_body NULL`, bearer `scbs1` frente al token opaco y filtro del YAML; el ADR corregido deja estos riesgos como gates verificables del porteo, sin declararlos implementados.

Ambos dictámenes cubren la **decisión documental**: conservar el YAML integrado/servido/pinneado con SHA-256 `7B907A2E11C52A66B7253407FB3F9450CAE7B792BECCF34C1636BE9D3945DE30`, diferir el YAML dirty `2AEACCD5E1AA3990CF514DAC5C241DBF6E9420999426C89768FCEF05FDFCB7FD`, y fijar un owner destino propuesto por cada una de siete rutas de negocio y la ruta OpenAPI. Las diferencias V4–V7/V7.x se tratan como deltas futuros sobre la historia integrada.

## Alcance y residuales

POSC-000 pasa a `done` documental; el WIP queda `ready_for_baseline_contract_harness` con 1/9 tareas done. POSC-000A aún debe validar parser OpenAPI 3.1, fixtures del baseline, SHA-256 de bytes y pin. El PIC-008A histórico 128/129 sigue diferido. Los controllers especializados, sus use cases/ports y el trabajo de Flyway son **candidatos**: todavía no hay GO de código, porteo, worker, purge, ACL, conexión live, activación de `BLACKSTORE_INTEGRATION`, release o `sdd.finish`.

El GO del ADR tampoco prueba que la autenticación actual verifique un bearer opaco real, que un backfill histórico distinga WEB/EXTERNAL_BLACKSTORE, que el nuevo reader lea receipts con `result_body NULL`, o que el filtro preserve `/openapi.yaml`. Cada punto conserva pruebas positivas/negativas y upgrade PG16 en su corte futuro. La comprobación del digest aquí fue sobre archivos y pin; no sustituye la prueba HTTP de bytes por toda la cadena de filtros.
