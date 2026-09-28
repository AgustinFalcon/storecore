# Meta — simulación de envío en el checkout

- **Feature Name:** `storecore-shipping-quote-sim`
- **Feature ID:** `feat-20260926-storecore-shipping-quote-sim`
- **Feature UUID:** `c4e8a1b2-6d30-4f77-9a12-8b0e5c7d91aa`
- **Status:** `documented` (plan + Stitch; sin archive, sin carrier real, sin Kotlin)
- **Mode:** standard · **Project type:** production · **Platform:** frontend-web · **Language:** es
- **spec_language:** es
- **Related:** `20260923-storecore-frontend-ux-system-v1`

## Objetivo

Agregar la cotización simulada y el recorrido que el customer va a ver: pedido confirmado, en preparación, empaquetado, listo para retirar o despachado, y la fecha de llegada. Correo Argentino queda para después. No abre un carrier, no crea tracking real y no acredita un pago.

## Fuera de alcance

Carrier live, Andreani, Correo, Mercado Envíos, SDK de pagos, fiscal, BlackStore, precio effective de Kotlin, merge a `master`.
