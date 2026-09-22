# TASK-008 — Authorized Mercado Libre sync

**State:** complete for authorized mapping + durable notification inbox. Refetch/reconcile workers remain installation-configured and are not claimed as CI-proven vendor calls.

## Evidence

- Admin account/listing HTTP maps listing/variation → SKU on a configured `channel_accounts` row.
- `POST /api/v1/integrations/mercadolibre/notifications` requires an authorized account, official topic+resource, and commits `ml_notification_inbox` before ACK. Replay is one inbox row.
- Notification handling does **not** decrement stock or invent a sale from the payload. Official refetch/application is a later worker when credentials exist.
- GATE proven: persist-before-ACK, unauthorized 409 retryable, listing mapping. GATE not claimed: live ML OAuth, remote refetch, signature when official docs do not require one.

## Out of this evidence

- Live ML OAuth and remote refetch against production Mercado Libre (no secrets in repo).
