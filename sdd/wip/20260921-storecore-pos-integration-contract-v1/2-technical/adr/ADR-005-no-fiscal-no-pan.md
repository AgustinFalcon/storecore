# ADR-005 — Fiscal, PII, rate limits y auditoría

**Status:** proposed for Sol · **Fecha:** 2026-09-21

## Decision

Sin fiscal/PAN/CVV en esta API. D-RATE: 30 reserve/s + burst 10; catalog/stock-read 60/s; reconcile 5/s; `Retry-After`.

Override: scope `price:override`; `X-Actor-Role` audit-only; evento `BLACKSTORE_PRICE_OVERRIDE` append-only. Receipt lleva `acceptedPriceVersions[]`.

Un solo OpenAPI: StoreCore `1.0.0-draft`. Envelope `BaseResponse` + `HttpCode` (ADR-006).

## Rejected

Dos YAML divergentes. IEEE-754. Autorización por header de rol.
