# Frontend-first data environment readiness

Date: 2026-10-15
Status: documented; execution deferred until the frontend journeys and their productive bindings are closed.

## Objective

Feed the StoreCore frontend with credible, correlated data without using direct SQL to fabricate domain outcomes, without expanding the approved backend scope, and without mixing Demo fixtures with the productive runtime.

## Runtime boundary

- `/demo/**` uses `demoSeed()` and versioned browser snapshots. It must remain isolated from `/api`, credentials and external providers.
- The productive runtime uses the existing `/api` contracts. An endpoint being present in the backend does not automatically authorize a new frontend action; `delivery-manifest.json` remains the authority for this WIP.
- A fresh Flyway database is schema-ready, not installation-ready. Provisioning requires the installation singleton, capability configuration and a securely bootstrapped ADMIN before commercial data can be loaded.

## Data that may be prepared through existing services

1. Home content through the existing home content command or profile preview/merge.
2. Catalog through `PUT /api/v1/user/catalog/products/{sku}`. Initial inventory must flow through the catalog/inventory service so ledger and audit remain coherent.
3. CUSTOMER identity through registration, followed by profile and address commands.
4. Cart lines through the customer cart contract.
5. Orders through idempotent checkout. Without an authoritative payment provider, their honest initial state is `PENDING_PAYMENT`.
6. Offers and campaigns only through their existing commands and capability/authorization rules.

## Forbidden shortcuts

- No direct insert or update of stock balances.
- No SQL-created approved payments, refunds, carrier labels, fiscal documents or Mercado Libre synchronization.
- No real customer PII, seller identifiers, tokens, credentials or provider secrets in fixtures, screenshots or exports.
- No modification of historical Flyway migrations to make a demo look populated.
- No mock repository in the productive dependency graph.

## Deferred environment task

When SC01..26 behavior is complete, create a separate approved SDD for a local showcase environment with:

1. explicit disposable database identity and reset policy;
2. installation provisioning and capability bootstrap checklist;
3. secure interactive ADMIN bootstrap;
4. idempotent API-driven loader for home, catalog, CUSTOMER, addresses, cart and pending orders;
5. deterministic `.invalid` identities and synthetic addresses;
6. verification of ledger, reservations and API reads after every step;
7. teardown that targets only the named disposable environment.

This task must not activate Mercado Pago, Mercado Libre, ARCA, Correo Argentino or email delivery. Those remain separate homologation tracks.
