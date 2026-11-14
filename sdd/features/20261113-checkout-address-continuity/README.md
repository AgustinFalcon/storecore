# Continuidad checkout/direcciones

Checkout y direcciones mantienen retornos cerrados, errores independientes,
fencing por actor e intento y rotación de idempotencia ante una nueva intención
de compra. Lecturas tardías no borran el estado de pago.

Entrega: PR #261, merge `ae36a99`; Verify PR `43495650447` y post-merge
`43497831638`, ambos 3/3 verdes.
