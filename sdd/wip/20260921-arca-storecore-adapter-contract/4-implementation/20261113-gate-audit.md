# Auditoría de gates de entrada — 2026-11-13

Baseline revisado: StoreCore `913cacd`; biblioteca ARCA `249b884` (sucesor
documental del candidato técnico `8efeace`). Dos revisores GPT-6.1 Sol, uno de
plataforma/pagos y otro fiscal/SDD, contrastaron resultados.

## Veredicto

- D-01/D-07/SC-02/SC-07: **Open**. El lane MP Orders V4 aporta evidencia
  comercial durable, pero no adopción ni frontera fiscal.
- D-02..D-06 y SC-01/SC-03..SC-06: **Open**. Requieren las decisiones y
  aprobadores registrados en `decision-intake-template.md`.
- Código, DDL, adapter, secretos, homologación, emisión y producción: **NO-GO**.

## Evidencia técnica vigente

El origen comercial actual es
`mp_order_commercial_applications` → `mp_verified_business_events` →
`mp_order_outbox`; el worker legado no procesa pagos. La creación/refetch de
Orders, idempotencia, binding único y comparaciones comerciales de identidad,
importe, moneda y referencia ya existen. Sin embargo,
`OfficialOrderApiAdapter` usa `ARS` cuando el wire omite moneda: esa ausencia no
falla cerrada y debe corregirse/validarse dentro de D-07. Las pruebas locales
con fakes tampoco acreditan el proveedor ni cierran ese gate.

## Drifts corregidos

1. Provenance actualizado al lane MP V4 sin adoptar su outbox como fiscal.
2. `ABSENT_CONFIRMED` definido como estado cerrado antes de reprogramar la misma
   intención.
3. Evidencia de diseño pre-GO separada de pruebas ejecutables post-GO.
4. Distribución reproducible alineada entre readiness y plan del adapter.
5. Homologación referida al servicio que D-04 seleccione, sin presuponer WSFEv1.

Este corte sólo prepara decisiones. No cambia el estado Open de ningún gate.
