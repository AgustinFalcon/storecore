# Functional specification

## Actors

- **Operator:** prepares a disposable local environment and supplies the
  already-bootstrapped ADMIN credentials through process environment variables.
- **ADMIN:** owns the catalog and home-content mutations performed by the loader.
- **Synthetic CUSTOMER:** uses a reserved `.invalid` identity and exercises the
  same profile, address, cart and checkout contracts as the browser.

## Requirements

### SCE-R01 — Explicit target

The operator must explicitly supply the API base URL and browser origin. The
loader accepts only loopback HTTP targets by default. Any other target is
rejected before authentication or mutation.

### SCE-R02 — Secure authority

The loader must not provision an internal USER. It authenticates an existing
ADMIN, keeps cookies and CSRF only in memory, and never prints credentials,
cookies or tokens.

### SCE-R03 — Idempotent commercial data

Repeated execution produces the same home copy and SKU set. Product inventory
flows through the catalog command so inventory ledger and audit remain
coherent. Existing stock changes include an explicit adjustment reason.

### SCE-R04 — Credible customer journey

The loader registers or reuses a synthetic CUSTOMER, ensures one deterministic
default address and leaves a representative cart populated. If pending-order
creation is explicitly enabled, it creates at most one idempotent checkout and
accepts only `PENDING_PAYMENT`.

### SCE-R05 — Honest verification

After mutation the loader reads public home/catalog/product data and the
authenticated customer cart. Missing SKUs, an empty cart, an unknown stage or
any unexpected payment/order state fail the run.

## Acceptance criteria

1. No direct SQL exists in the loader.
2. No real PII, access token or provider credential is committed.
3. Every finite stage is represented by a closed type with an `Unknown` case.
4. Unit tests cover stage translation, target rejection and secret-safe config.
5. Running without required credentials exits before the first HTTP request.
