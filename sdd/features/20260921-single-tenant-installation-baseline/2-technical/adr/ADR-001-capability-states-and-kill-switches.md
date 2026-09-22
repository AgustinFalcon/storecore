# ADR-001 — Typed capability states and narrow kill switches

**Status:** proposed / ready_for_sol_review

## Decision

A typed `capability_modules`/`capability_actions` allowlist defines every module/action; free-text module/action values are invalid. Core coverage includes storefront/catalog, profile/content, checkout/payments Mercado Pago, manual fulfillment, Marketplace Mercado Libre and manual promotions. Future optional modules are explicitly registered only in DISABLED state.

`module_configurations` is versioned and scoped to the merchant installation. Every capability has exactly one state: `DISABLED`, `READ_ONLY`, `ACTIVE`, `PAUSED` or `ERROR`. Only ACTIVE permits an authorized write adapter.

A kill switch is not a generic feature flag. It targets an allowlisted module/action at typed installation scope and requires owner, reason, creation, expiry and removal ticket. A PostgreSQL partial unique index (`WHERE active`) prevents two active switches for the same pair/scope while allowing unlimited inactive audit history. It fails closed when expired or malformed. `feature_flags`, global catch-all switches and permanent booleans are prohibited.

## Consequences

Capability state expresses normal operation; kill switch expresses exceptional, reversible safety action. Deferred capabilities have no active writer in core.
