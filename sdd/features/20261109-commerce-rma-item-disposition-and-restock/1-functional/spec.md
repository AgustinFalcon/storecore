# Spec funcional — disposición RMA por ítem

## Requisitos

- RMA-R01 — Un USER con capability de fulfillment abre una devolución `RETURN_RECEIVED` y ve identificadores estables, SKU/nombre histórico y cantidad recibida de cada línea.
- RMA-R02 — Cada línea se particiona en cantidades enteras no negativas `RESTOCK`, `DAMAGED` y `REJECTED`; la suma debe ser exactamente la recibida. Ítems omitidos, duplicados, ajenos, desconocidos o excedidos se rechazan sin escritura.
- RMA-R03 — El flujo es cerrado: `Editing → Reviewing → Confirming → Confirmed`, con `Unknown` fail-closed. Cambiar orden, actor o sesión descarta el borrador local.
- RMA-R04 — Antes de confirmar se muestra el delta vendible por SKU. `DAMAGED` y `REJECTED` nunca aumentan disponibilidad. Si `DAMAGED > 0` exige un `DamageReason` cerrado (`COSMETIC`, `FUNCTIONAL`, `MISSING_PARTS`, `UNSAFE`, `OTHER`); si `REJECTED > 0` exige un `RejectionReason` cerrado (`NOT_OUR_ITEM`, `SERIAL_MISMATCH`, `OUT_OF_POLICY`, `INCOMPLETE_RETURN`, `OTHER`). RESTOCK no admite motivo. Observación opcional, máximo 500 caracteres, no sustituye outcome/motivo.
- RMA-R05 — Un único comando confirma todas las líneas atómicamente: clasificación, auditoría, ledger `RMA_RESTOCK`, balance y estado `CLOSED`. No existe `INSPECTED` durable editable en este corte.
- RMA-R06 — La misma clave idempotente y el mismo payload recuperan el resultado original aunque el RMA ya esté `CLOSED` o exista una reversión posterior; la misma clave con otro payload produce conflicto. Doble clic, dos operadores y respuesta perdida no duplican stock. Un solo comando puede ganar por RMA.
- RMA-R07 — La autorización se revalida al confirmar: sesión USER, capability, CSRF, origen, ownership, evidencia de pago/stock y ausencia de reversión. La lectura previa no concede autoridad futura.
- RMA-R08 — Si una reversión/incidente gana el lock antes del cierre, no hay cambios. Si ocurre después, abre revisión operativa y no compensa automáticamente stock físico.
- RMA-R09 — Un `RETURN_RECEIVED` completo y verificable sin clasificación es elegible para este flujo. Sólo históricos ya avanzados (`INSPECTED`/`CLOSED`) sin evidencia por línea se leen como `HistoricalIncomplete`; no se infieren resultados desde `returns.inspection_result` ni se habilitan acciones.
- RMA-R10 — CUSTOMER sólo recibe una proyección explícita y sanitizada si se implementa; nunca actor, clave, motivos internos ni detalles de infraestructura. El DTO USER no se reutiliza por accidente.

## Escenarios de aceptación

1. Dos unidades: 1 RESTOCK + 1 DAMAGED; sólo una vuelve a vendible y ambas quedan auditadas.
2. Todo DAMAGED o REJECTED: cierre válido sin ledger de reposición.
3. Suma incompleta/excedida, negativo, duplicado, omitido, ajeno o Unknown: rechazo y cero efectos.
4. Dos operadores o doble confirmación: un resultado durable y un solo delta.
5. Commit con respuesta perdida: GET recupera cierre; reload no duplica.
6. Reversión antes del lock final: conflicto y cero efectos; reversión posterior sólo abre revisión.
7. Sin sesión, CUSTOMER, rol/capability perdido, CSRF/origen inválido: denegación sin escritura.
8. Histórico `INSPECTED/CLOSED` sin líneas clasificadas: lectura incompleta, sin acción.
9. Retry del mismo comando después de cierre o reversión posterior: devuelve el resultado original sin revalidar elegibilidad mutable ni duplicar ledger.

## Estados visuales mínimos

Loading, lectura disponible, histórico incompleto, edición, revisión, confirmando, confirmado, acceso denegado, conflicto de evidencia, respuesta incierta recuperable y error no recuperable.
