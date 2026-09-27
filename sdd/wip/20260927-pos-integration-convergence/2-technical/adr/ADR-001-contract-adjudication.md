# ADR-001 — adjudicar el drift del OpenAPI antes del porteo

- **Estado:** `proposed_pending_adjudication` (GO documental dual para preparar POSC-000/000A; esta elección contractual aún no está aprobada)
- **Fecha de inventario:** 2026-09-27
- **Contrato publicado en integración y servido por `/openapi.yaml`:** `1.0.0-draft`, SHA-256 `7B907A2E11C52A66B7253407FB3F9450CAE7B792BECCF34C1636BE9D3945DE30`.
- **Copia dirty de readiness:** también dice `1.0.0-draft`, SHA-256 `2AEACCD5E1AA3990CF514DAC5C241DBF6E9420999426C89768FCEF05FDFCB7FD`; diff de 108 líneas añadidas y 43 eliminadas.
- **Consumer actual:** BlackStore connector meta y su pin local apuntan a `7B907...DE30`. No presume compatibilidad con `2AEAC...B7FD`.

## Decisión propuesta para esta convergencia

Conservar el artefacto integrado `7B907...DE30` como contrato de trabajo de esta convergencia: coincide byte a byte con la copia servida y con el pin de BlackStore. **Rechazar el reemplazo íntegro** por la copia dirty `2AEAC...B7FD`. Diferir sus cambios individuales a un WIP de evolución del contrato con productor y consumidor, salvo que una review cruzada demuestre y acepte explícitamente un cambio compatible. El GO documental permite preparar esta adjudicación y sus fixtures; la decisión ADR, el digest validado y el GO de porteo siguen pendientes. El PIC-008A histórico con SKU 128/129 no se declara completo.

Todo cambio futuro de digest exige parser OpenAPI 3.1, fixtures y juicio backward/additive. Cualquier cambio incompatible de token, forma de respuesta, estados o error/retry exige contrato versionado y re-review cruzada antes de transportar.

| Superficie | Diferencia observada | Disposición propuesta en este WIP | Evidencia para evolución posterior |
|---|---|---|---|
| SKU | `maxLength: 64` → 128 en catálogo, stock, líneas, fallos y receipts | **Diferir**; POSC-000A valida 64/65, PIC-008A histórico 128/129 sigue pendiente. | Constraints persistentes, DTOs/fixtures BlackStore y aceptación/rechazo de 128/129; ensanchamiento productor puede romper un consumer limitado a 64. |
| Bearer | `service-identity` opaco → selector `scbs1.<32 hex>.<base64url>` y precedencia 401/403 | **Diferir**; conservar bearer del pin integrado. | Emisor/verificador, rotación y redacción; el pin existente no prueba que BlackStore emita esa forma. |
| ETag/cursor | Header débil `W/"<43 base64url>"`, body raw digest, 304 acotado y `CURSOR_EXPIRED` explícito | **Diferir** semántica nueva. | Equivalencia de 200/304/410 y caché consumer; no convertir 500 cost-source en 304. |
| Override | `price:override` restringido a `priceVersion` con ventana actual, reason y gate de auditoría | **Diferir** el cambio de wire; cualquier operación no respaldada por auditoría queda fail-closed en runtime. | Denegación antes de gate, semántica de 422 y dependencia BlackStore. |
| 409/410 | `CONFLICT` puede dejar 404 o PENDING; `OPERATION_STATE_CONFLICT` terminal no retryable; tombstone 410 | **Diferir** diferencias de precedencia/retry; fixture de baseline primero. | Fixtures por endpoint y recovery policy BlackStore; no inferir re-POST de `retryable` solo. |
| Receipt/reconcile | `expiresAt` required en RESERVED; duplicados 400/orden de receipts, ajenos/revocados/retirados como unknown | **Diferir** restricciones nuevas de wire. Baseline `knownReceipts` admite 1..500 sin `uniqueItems`; adapter deduplica repetidos (0/501 inválidos, 500 válidos). | Snapshots y proyección BlackStore; reconcile RO y unknown nunca autoriza POST. |

## Evidencia de salida de POSC-000

1. Diff revisado del YAML integrado, copia servida y propuesta dirty, con hashes recalculados sobre bytes exactos y disposiciones de la matriz aceptadas o corregidas por Astra/BlackStore.
2. POSC-000A valida por parser OpenAPI 3.1 y fixtures **sólo el baseline elegido**: status/`code`/HTTP, 409 por endpoint, tombstone 410, GET PENDING 200 y ausencia 404 como casos separados, `lineFailures` cuando aparece, ETag/304, OneOf, SKU 64/65 y reconcile 1..500 sin `uniqueItems`. La aceptación/deduplicación de duplicados se prueba contra el adapter baseline en PIC-006A; 400 por duplicados es dirty. No aplica fixtures dirty `if/then`, ETag exacto ni precedencia 410→409→404 al digest integrado. El PIC-008A histórico de readiness exigía 128/129; queda pendiente/diferido y no se marca done por esta validación.
3. Si el baseline integrado se mantiene, versión/digest y pin BlackStore quedan intactos y los cambios diferidos se especifican/revisan aparte. Si se acepta algún cambio, registrar versión/digest nuevos, compatibilidad y actualización coordinada del pin con GO documental de ambos repos; una ruptura exige contrato/versionado y migración del consumer.
4. Fijar DTOs/rutas a portar y adapter owner sólo contra el digest aprobado. Hasta re-review de este ADR y POSC-000A, la implementación sigue NO-GO. El PIC-008A histórico se resolverá en la evolución contractual separada si se decide incorporar su semántica.
