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
