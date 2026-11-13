# Sol gate — Mercado Pago currency fail-closed

Fecha: 2026-11-13

## Dictamen

**CONDITIONAL_GO** sin hallazgos P0–P3 residuales para implementar únicamente
el correctivo offline descrito en
`sdd/wip/20261113-mp-orders-fail-closed-currency/`.

Dos revisores GPT-6.1 Sol de dominio/pagos y seguridad contrastaron el contrato.
Los cambios exigidos durante la revisión quedaron incorporados: gate fresco tras
el closeout de 2026-09-23, rechazo de `UNKNOWN/UNKNOWN`, delimitación del binding
provisional de POST, ambas escrituras de evidencia, referencia WIP correcta y
matriz de tests compatible con el constraint V4 que sólo admite ARS local.

## Alcance autorizado

- Tipo cerrado `PaymentCurrency` con `ARS`, `UNKNOWN`, `fromWire` y regla de
  compatibilidad verificada.
- Mapper JSON compartido por GET/search, fail-closed para nodos inválidos.
- Uso del tipo en recovery, worker y evidencia monetaria.
- Pruebas puras y PostgreSQL offline; suite, CI y revisión de código posteriores.

## NO-GO preservado

MP-LIVE-05, red real, credenciales, activación, homologación, producción,
fiscal, deploy, publicación, DDL y ampliación del POST permanecen fuera de este
dictamen. El código todavía debe obtener dos approvals independientes y CI verde
antes de merge.
