# ADR-004 — Offline MVP y cursor (D-CURSOR)

**Status:** proposed for Sol · **Fecha:** 2026-09-21

## Decision

Cursor opaco bound a companion + `catalogVersion`. Page 200. Retención 7 días. Sin offset. `validUntil` obligatorio.

StoreCore down: BlackStore cache RO y **bloqueo** de ventas nuevas.

## Rejected

Offset pagination. Ventas contra cache de stock.
