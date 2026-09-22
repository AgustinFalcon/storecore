# Review must-fix closure — StoreCore core v1.0.0

**Fecha:** 2026-09-22  
**Alcance:** P1 de Grok 4.7 (security/backend) y MUST-FIX de Astra/high que cabían en el baseline.

## Cerrado

- Checkout replay compara `addressId`/`currency` del snapshot aunque el carrito esté vacío.
- Transiciones de shipment `PENDING → PREPARING → SHIPPED → DELIVERED`; frontend reconoce estados persistidos.
- `expireOverdue()` tiene caller productivo `@Scheduled`.
- Promo policy ya no crea oferta `PERCENT 10` activa.
- Inbox MP/ML: tope de envelope 16 KiB + 60 hits/min por IP; kill switch sigue siendo break-glass.
- HTTP CSRF-protected `remove`/`replace` de kill switches; kills vencidos no deniegan el módulo.
- Identidad: origin de instalación sin fallback Host; CSRF renovable; login interno sin rol no emite cookie; `Cache-Control: no-store`.
- Catálogo escribe stock por ledger y oculta safety stock en storefront.

## Residuales honestos (no bloquean el baseline)

- TASK-008/014: refetch/reconciliación live ML sigue en **TODO-041**.
- TASK-013: Playwright/axe/Stitch no automatizado.
- Inbox: no se inventó HMAC; autenticidad contractual queda a allowlist de red/operación.
- TODO-003: runbook de flota en `2-technical/fleet-operations.md`.

## Evidencia

- Backend targeted: `WebhookInboxLimiterTest`, `CapabilityTask003Test`, `CommerceHttpIntegrationTest`, `IdentityHttpIntegrationTest`.
- Frontend: `npm test` — 42 passed.
- No tag, deploy ni publish.
