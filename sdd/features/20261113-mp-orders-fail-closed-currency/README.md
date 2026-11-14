# Mercado Pago Orders currency fail-closed

El borde Orders traduce moneda mediante `PaymentCurrency`, usa `Unknown` ante
wire ausente o inválido y rechaza acreditación/recovery antes de cualquier
efecto comercial. El adapter oficial continúa desactivado por defecto.

Entrega: PR #258, merge `43489ef`; Verify PR `43460940429` y post-merge
`43462225801`, ambos 3/3 verdes.
