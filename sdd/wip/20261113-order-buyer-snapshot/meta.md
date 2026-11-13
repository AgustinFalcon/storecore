# Metadata — identidad histórica del comprador

- Estado: `SPEC_REVIEW`
- Fecha: 2026-11-13
- Modo: brownfield, StoreCore backend y contrato de pedidos existente
- Issue origen: auditoría de paridad operativa posterior al cierre de checkout/direcciones
- Autoridad: rama `fix/order-buyer-snapshot` creada desde `master` en `fc99b68d7733bdb55437cecc9eb2731a81824e1a`

## Alcance

Captura prospectiva e inmutable de nombre y email canónicos del CUSTOMER al crear
una orden. Se reutilizan el JSONB, la proyección `OrderFact`, los endpoints y la UI
existentes. Sin migración, backfill, cambio de API, PII adicional ni fallback al
perfil mutable.
