---
id: 20261113-cart-checkout-currency-authority
title: Autoridad cerrada de moneda en carrito y checkout
status: completed
maturity: delivered
owner: commerce
created: 2026-11-13
related:
  - ../20261113-mp-orders-fail-closed-currency
  - ../20260921-phase1-commerce-operations
  - ../20260921-single-tenant-installation-baseline
---

# Metadatos

Este corte elimina strings y fallbacks ARS en carrito/checkout. La instalación
single-tenant conserva ARS como única moneda admitida, pero backend y frontend
deben representarla como tipo cerrado y fallar a `Unknown` cuando la autoridad
de instalación o el wire no sean válidos.

La experiencia deja de ofrecer un campo editable que sugiere multimoneda. El
checkout muestra ARS como dato fijo sólo cuando fue confirmado por backend; ante
`Unknown` bloquea el pago y presenta indisponibilidad sin imprimir el wire.

Entrega: PR #259, merge `653b5eb`; Verify PR `43479521115` y post-merge
`43481720083`, ambos 3/3 verdes.
