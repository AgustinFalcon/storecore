# Productive surface real integration gate

Run against an empty disposable PostgreSQL **16** database named
`storecore_ua_e2e`. Never point this gate at an operator database. The runner
rejects another database name, non-loopback host, non-16 server and nonempty
public schema. It never resets or drops a database.

Build the exact working snapshot first:

```powershell
# backend
mvn -B -DskipTests package
# frontend
npm run build:demo
npm run check:psd-real
npm run test:psd-real
```

Prerequisites: Java, Node/npm dependencies, Chromium installed for Playwright,
`psql`, `openssl`, and a running disposable PG16 server. Use
`STORECORE_UA_JAVA`, `STORECORE_UA_PSQL`, `STORECORE_UA_OPENSSL` to select explicit
executable paths. PG environment defaults are loopback:5434, user/password
`storecore`; they are disposable fixtures, never installation credentials.

A container can be provisioned explicitly (Docker access required):

```powershell
docker run --name storecore-psd-t08 -e POSTGRES_DB=storecore_ua_e2e -e POSTGRES_USER=storecore -e POSTGRES_PASSWORD=storecore -p 127.0.0.1:5434:5432 -d postgres:16-alpine
```

The operator owns the container lifecycle. After collecting evidence, stop and
remove **only that named disposable container**. The runner owns and stops its
Spring/Angular/Demo/Playwright processes and removes its temporary certificate.
Ports 8080, 4301 and 4390 must be free. Port 4302 is unused.

The runner migrates clean V1–V14 and obtains a real Argon2id hash through
registration before inserting synthetic test-only ADMIN/installation fixtures.
The installation guard is enabled for both loading and browser stages.
It preserves the unchanged ShowcaseConfig HTTP-only boundary while running the
updated loader twice, checks first/replay
order creation, unchanged order count/inventory, and preservation of an unrelated
offer created through the API. It then stops Spring and restarts over the same
database with HTTPS installation Origin. No ShowcaseConfig boundary is relaxed.
The adapter stays explicitly `unconfigured`; the safety endpoint and external
capabilities are checked again after restart. No provider simulator runs.
Safety reads are ADMIN-only and noncacheable. They expose only closed adapter
and external-module states, including hidden BlackStore, without console controls
or credentials. These reads are snapshots, not an atomic lock against concurrent
ADMIN changes; the loader is a sequential local operator tool, not a concurrent
installation provisioning service.

The eight browser cases exercise actual Angular and HTTP with no API mocks:
favorite removal/add/reload and realm separation; OPERATOR read/denied mutation,
foreign-realm CSRF rejection; offer creation/end/reload;
overview/inventory at 390/768/1440 with axe/reflow; customer search/detail and
suspension/reactivation with irreversible old-session revocation; and separate
optimized Production/Demo entrypoints. Browser DNS is restricted to loopback so
fixture images cannot initiate external provider traffic.

Production is served using Angular's production configuration. Demo uses the
separately built `dist/storecore-demo` static output. Run `npm run verify` for
source architecture boundaries and normal production build as a separate gate.
This targeted suite is not the entire PSD-T06 acceptance matrix or a full Demo
regression suite. Existing UA/CFE browser tests remain separate and use a local
official-provider simulator; they do not prove this disabled-adapter gate.

Migration matrix (backend, Docker/Testcontainers PG16):

```powershell
mvn -B "-Dtest=CoreSchemaMigrationTest,CatalogAttributeOrderMigrationTest,CfeBaselineUpgradeMigrationTest,CapabilityDefinerMigrationTest,CapabilitySessionAdministrationMigrationTest" test
```

This covers clean V1–V14, V11→V14 with published checksum/history preservation,
V13→V14 with historical row preservation, validate/no-op replay and capability
migration hardening. Reports/logs from this browser gate live under ignored
`frontend/psd-real-results/`. Discovery/typecheck is not runtime evidence. Record
the exact Git SHA and fresh package/build commands alongside runtime results.
