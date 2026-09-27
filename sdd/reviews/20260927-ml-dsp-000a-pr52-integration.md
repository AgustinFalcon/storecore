# TASK-DSP-000A — evidencia de integración del PR #52

**Fecha:** 2026-09-27  
**Alcance:** sellado del writer directo PIC-009; ningún otro paso del DAG ML  
**PR:** https://github.com/AgustinFalcon/storecore/pull/52  
**HEAD revisado:** `2659c2cd97b1f7c42318a6487f42748160877a7b`  
**Merge sólo a `integration/storecore-int`:** `56baa2db2d6fabbd683ce41459414c556cb5246d` (2026-09-27 20:22:04 UTC)

El PR elimina el adapter y el port que escribían directamente `channel_listings.desired_quantity` y `LISTING_STOCK` tras commit/release de la saga BlackStore. El bridge nuevo devuelve `NOT_ELIGIBLE` sin persistencia ni red; el snapshot histórico de outbox permanece intacto. La futura delegación al proyector canónico deberá estar en su transacción y exige un GO separado de PIC-005. La capability BlackStore no queda activada.

La evidencia reportada para el HEAD fuente final `2659c2c` fue:

- PG16/Testcontainers enfocado: 3 suites, 15 tests, 0 fallos, errores o skips; incluyó commit, replay y release con fixture `ACTIVE` y preservación de `desired_quantity` y la fila histórica completa de outbox.
- Backend `mvn -q test`: 29 suites, 126 tests, 0 fallos, errores o skips.
- Dos revisores Astra independientes dieron GO sobre el diff remoto exacto y confirmación final sobre ese HEAD. Esta evidencia corresponde a la revisión interna documentada en el cuerpo del PR, no a reviews publicadas en la UI de GitHub.
- `git diff --check` pasó antes del merge.

El workflow alojado Verify del PR, run `36347376364`, terminó en `failure`: jobs `backend` y `frontend` con `steps=[]`. Por tanto, **CI alojado no está verde**. El merge a integración no autoriza master, `sdd.finish`, release, deploy ni activación ML/BlackStore.

TASK-DSP-000A queda `done` en integración. TASK-DSP-000B y el resto del DAG continúan pendientes; el WIP permanece `ready_for_implementation` / implementación `in_progress`. El documento `20260927-ml-dsp-000a-local-dual-code-go.md` conserva su condición de foto histórica anterior al PR.
