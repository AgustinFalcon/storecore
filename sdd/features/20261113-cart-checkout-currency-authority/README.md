# Autoridad cerrada de moneda en carrito y checkout

La instalación ARS-only expone una moneda cerrada y autoritativa. Un valor
ausente o inválido se convierte en `Unknown`, bloquea checkout y nunca se
reemplaza visualmente por ARS ni por un input editable.

Entrega: PR #259, merge `653b5eb`; Verify PR `43479521115` y post-merge
`43481720083`, ambos 3/3 verdes.
