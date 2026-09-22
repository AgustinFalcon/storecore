# ADR-001 — Companion 0..1 y contextos separados

**Status:** proposed for Sol · **Fecha:** 2026-09-21

## Decision

BlackStore no es módulo StoreCore. 0..1 companion vivo. Prefijo HTTP exclusivo `/blackstore-integration/v1` (D-PATH; sin slash final). `X-Client-Instance-Id` se valida contra el token; no es `store_id`.

## Consequences

Nunca JDBC cruzado. Tablas `blackstore_integration_*` viven en PostgreSQL StoreCore como delta futuro, no como POS interno.

## Rejected

Módulo POS interno; multi-companion; `/pos-integration/v1/`.
