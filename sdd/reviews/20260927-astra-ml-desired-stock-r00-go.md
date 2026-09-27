# TASK-DSP-R00 — revalidación documental Astra

**Fecha:** 2026-09-27
**Objeto:** `sdd/wip/20260924-ml-desired-stock-projection/` revisado después de los MUST-FIX.
**Veredicto:** **GO documental para iniciar TASK-DSP-000A y TASK-DSP-000B** siguiendo el DAG. No es aprobación de código, de PR, de activación ML/BlackStore, de CI remoto ni de release.

El revisor Astra comprobó el cierre de los cuatro bloqueantes del pase anterior:

1. La función estrecha `SECURITY DEFINER` obtiene el snapshot y locks de action/config/kill completos en PG16, sin UPDATE directo para runtime; se exigen pruebas positivas, negativas y concurrentes.
2. El protocolo de locks cubre cuentas, productos, variantes, pedidos, intentos MP, reservas, balances y listings, así como sus callers WEB/MP/expiry y revalidación/retry de candidatos.
3. `releaseSaga` WEB interno está decidido para terminación MP verificada no pagada; no libera estados pendientes o acreditados, y se prueban carreras consume/expiry.
4. Base efectiva `integration/storecore-int` `ab817891abb6c7b710bca809804d924401ed74f0`: PIC-009 `69f209b` es ancestro, V1–V7 existen y V8 estaba libre en ese snapshot. Revalidar justo antes de migrar si la rama avanza.

La revisión validó 14 tareas, una documental ya cerrada antes de este dictamen, dependencias existentes y DAG sin inversiones. SHA-256 de la spec técnica revisada: `BC667B6BD336D13C3EE1932F56C8ABC93F4B622454642C8EF3943B8D9B270D3D`.

Dos ajustes editoriales no bloqueantes identificados por Astra fueron aplicados: `progress.md` ya señala Astra/R00 en vez de Sol GO, y la spec funcional distingue nuevos pagos live de Mercado Pago (fuera de alcance) del refactor transaccional y `releaseSaga` existentes (dentro).

Tras implementación siguen obligatorios PG16/Testcontainers, dos reviews independientes del diff final y PR a integración. Master requiere CI remoto verde. Este registro no autoriza `sdd.finish`.
