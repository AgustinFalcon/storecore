# Implementation progress

## 2026-11-08

- Functional and technical boundaries recorded before implementation.
- Added a loopback-only, API-driven loader with isolated ADMIN and CUSTOMER
  sessions and rotating CSRF support.
- Added closed loader stages with a single wire translator and unit coverage.
- Added deterministic home, catalog, address, cart and optional pending-order
  steps. No external integration is activated.
- Local API execution remains pending because it requires a disposable running
  StoreCore installation and operator-supplied ADMIN credentials.
- Environment probe on 2026-11-08 confirmed that Docker Desktop is stopped and
  no process listens on the isolated PostgreSQL port `5434`. The existing local
  PostgreSQL 18 service was deliberately left untouched: the showcase gate must
  not reuse an operator database or infer credentials. Resume T04 only with a
  disposable database and the documented interactive ADMIN bootstrap.
- Local static gates after `npm ci`: showcase unit tests 3/3 PASS, domain
  boundary tests 7/7 PASS, architecture scan PASS, frontend lint PASS and
  production Angular build PASS.

## 2026-11-08 — disposable runtime closure

- Initialized an isolated PostgreSQL 18 cluster on `127.0.0.1:5434`; the
  existing machine PostgreSQL service and its data were not used.
- Applied Flyway V1–V11, ran the TTY-only ADMIN bootstrap, then provisioned the
  required installation singleton before normal startup. The first bootstrap
  remained atomic (`1 USER`, `1 immutable marker`) even though the startup
  guard correctly rejected the still-unprovisioned installation afterward.
- The first API load exposed disabled base capabilities. Added closed
  `ShowcaseCapability` and `ShowcaseCapabilityState` allowlists and an ordered,
  idempotent ADMIN-API activation step for the five base modules only. No
  future-optional module or vendor adapter was activated.
- The first full load passed all nine stages and created one pending order. A
  replay exposed the duplicate-registration contract; the CUSTOMER step now
  performs login-first and registers only after a `401` result, without
  interpreting an ambiguous error string.
- Final replay passed all nine stages with `pendingOrderCreated=false`, proving
  the existing pending order and synthetic identity were reused.
- Final gates: showcase tests 4/4 PASS; architecture boundary tests 7/7 PASS;
  architecture scan PASS; lint PASS; Angular 134 test files / 988 tests PASS;
  production build PASS.

## 2026-11-08 — PR #230 review remediation

- The first independent Bugbot and security reviews reported four blocking
  issues: checkout could be attempted without authoritative adapter safety,
  replay could restore fixture stock after a reservation, an unrelated order
  could suppress the pending-order check, and wire roles/statuses were compared
  as magic strings.
- Added a fail-closed ADMIN safety projection backed by the closed
  `MpOrdersAdapterMode` enum. The loader now aborts unless the backend proves
  that the Mercado Pago Orders adapter is `UNCONFIGURED` and external checkout
  is disabled.
- The loader now creates catalog fixtures only when absent, so replay preserves
  reservations and operator inventory. Existing orders are matched by showcase
  SKU and must still translate to the closed pending payment/order states.
  ADMIN role, adapter mode, payment status and order status all enter through a
  single `fromWire` translator with `Unknown` fallback and unit coverage.
- Corrective gates: directed backend tests 15/15 PASS; loader tests 5/5 PASS;
  backend suite 197/197 PASS; frontend architecture 7/7, lint, Angular 134 files
  / 988 tests and production build PASS.
- Repeated the real gate on a fresh disposable PostgreSQL 16 container and the
  exact packaged jar. First load passed ten stages and created one pending
  order; replay passed ten stages with `pendingOrderCreated=false`. Database
  evidence after replay: three showcase products, one CUSTOMER, one order,
  taladro stock `11 available + 1 reserved = 12 total`, order
  `PENDING_PAYMENT`, payment `PENDING`.
- The backend process and disposable database were stopped; ports 8080 and 5434
  were closed and the temporary container was removed.
- The second exact-SHA Bugbot review found two additional P2 issues: loopback
  origin accepted non-HTTP protocols and address replay compared only street
  plus number. The configuration now rejects HTTPS/FTP loopback origins, and
  address replay compares all fixture fields and updates drift through the
  existing customer address endpoint. Unit coverage exercises both boundaries;
  a new exact-SHA review is required after the corrective commit.
- Corrective evidence: loader tests 6/6 and the full frontend gate (architecture
  7/7, lint, Angular 134 files / 988 tests, production build) passed. A fresh
  real runtime was loaded once, then its synthetic address was changed to
  Rosario/Santa Fe/2000/non-default. Replay restored Córdoba/Córdoba/5000/default
  through the API, kept exactly one address and one order, reported
  `pendingOrderCreated=false`, and preserved taladro inventory at
  `11 available + 1 reserved = 12 total`. Backend, database and temporary
  container were stopped and removed; ports 8080 and 5434 were closed.

## 2026-11-09 — documentary reconciliation

Local implementation is recorded as done in tasks.json. Earlier pending-review/CI statements are historical; this reconciliation has not established a feature-specific final close-out record. Preserve the own final candidate, reviews with provider/model/effort/base/head/scope/checks and CI evidence before declaring archive. Later CFE, RMA or bounded-navigation acceptance does not automatically close this WIP. No new test execution, provider activation or homologation is claimed here.

## 2026-11-10 — retrospective close-out via successor hardening

- PR #230 head `0b3e30adb7db5b38c55090ca431be97045cb9ea1` passed Verify `42455936812` 3/3 and merged as `e8d2dcd`.
- Two independent GPT-6.1 Sol medium retrospective reviews found two P2 defects: inactive products could be rediscovered as absent and have fixture stock restored, and CI action pins were relaxed from immutable SHAs to `@v4`.
- PSD head `9108798818b0217dcf5bb4685f59a195d63637ae` replaced public existence lookup with ADMIN detail and preservation assertions. CI commits `57cca3f` and `5bd8fcd` restored immutable action pins.
- Current master `1b1063946e3486f9ef4c2ca61aad66f14260199a` contains both fixes and passed Verify `42756672557`. Showcase closes through integrated successors, not by rewriting the verdict of `0b3e30a`.
- External providers, homologation and deployment remain excluded.
