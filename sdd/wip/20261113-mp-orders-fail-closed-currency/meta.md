---
id: 20261113-mp-orders-fail-closed-currency
title: Mercado Pago Orders currency fail-closed
status: ready_for_pr
maturity: proposed_implementation
owner: payments
created: 2026-11-13
related:
  - ../20260922-storecore-mp-live-checkout-v1
  - ../20260921-arca-storecore-adapter-contract
---

# Metadatos

Este corte corrige un defecto de confianza en el borde Mercado Pago Orders: el
adapter oficial convierte una moneda ausente en `ARS`, por lo que una respuesta
incompleta puede parecer compatible con el pedido local. La corrección crea una
moneda de pago cerrada, traduce valores no válidos a `Unknown` y obliga a que la
acreditación y el recovery fallen cerrado.

El adapter oficial continúa desactivado por defecto. El cambio no usa red ni
credenciales, no activa Mercado Pago y no ejecuta MP-LIVE-05. Los gates
MP-LIVE-03/04 establecieron el invariante de verificar importe y moneda, pero el
closeout de 2026-09-23 cerró ese carril y prohibió trabajo adicional sin un GO
nuevo. Por lo tanto, este WIP sólo puede implementarse si la revisión Sol actual
emite y registra un GO estrecho para esta corrección offline. El pedido vigente
autoriza continuar con correcciones revisadas, pero no sustituye ese gate SDD.
