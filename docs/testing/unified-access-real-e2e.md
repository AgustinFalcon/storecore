# Unified access real browser verification

`frontend/npm run test:ua-real` runs the UA-007 acceptance matrix against a real
PostgreSQL database, Spring Boot application and Angular HTTPS server. It uses no
HTTP interception or mock responses. This is separate from `test:a11y` and its
backend-less fixtures. No live integration credentials are needed.

## Prerequisites and commands

Use Java 17, Maven, Node >=22.12, psql, OpenSSL and a fresh PostgreSQL 16 database
named **storecore_ua_e2e**. The fixture account must be able to execute Flyway's
existing role/ownership migrations. The CI PostgreSQL container user has that
authority; it is not a production runtime account. Ports 5434, 8080 and 4301 must
be available. Do not point this harness at an installation database.

For a disposable local database, with Docker available:

```sh
docker run --name storecore-ua-e2e -e POSTGRES_DB=storecore_ua_e2e -e POSTGRES_USER=storecore -e POSTGRES_PASSWORD=storecore -p 5434:5432 -d postgres:16-alpine
```

Wait for `docker exec storecore-ua-e2e pg_isready -U storecore -d storecore_ua_e2e`.
From the repository:

```sh
cd backend
mvn -B -DskipTests package
cd ../frontend
npm ci
npx playwright install chromium
npm run test:ua-real
```

Defaults are `PGHOST=127.0.0.1`, `PGPORT=5434`, `PGUSER=storecore`,
`PGPASSWORD=storecore` and `PGDATABASE=storecore_ua_e2e`. Set these in your shell
if needed. A different database name or non-loopback host is deliberately rejected. Executable paths
can be supplied through `STORECORE_UA_PSQL`, `STORECORE_UA_OPENSSL` and
`STORECORE_UA_JAVA`; these accept paths, not shell fragments. For Windows, for
example:

```powershell
$env:STORECORE_UA_PSQL = 'C:\Program Files\PostgreSQL\18\bin\psql.exe'
$env:STORECORE_UA_OPENSSL = 'C:\Program Files\Git\usr\bin\openssl.exe'
npm run test:ua-real
```

The client version may differ from the server; the verification server is
PostgreSQL 16. The harness refuses a database containing any public tables, never
drops data and never reuses running web servers. Use a newly created disposable
database for another full run. Dispose of the specifically named test container
when finished; no cleanup of database containers is performed by the harness.

## Provisioning and transport

The runner first starts the packaged application with only the installation
presence guard disabled. Flyway runs the unchanged V1–V11 migrations, a real
customer registration computes an Argon2id fixture hash, and fixture SQL provisions
the installation and accounts. It stops that process and restarts the same jar
with the presence guard enabled before browser tests. No test authentication
endpoint, production seed or trigger bypass is added.

Angular serves `https://localhost:4301` using a temporary self-signed certificate.
Its `/api/**` proxy forwards to `http://127.0.0.1:8080`, preserving the browser's
Origin. The installation origin is exactly `https://localhost:4301`. Playwright
trusts the test certificate; the production cookie writer remains unchanged:
Secure, HttpOnly, SameSite=Lax, Path=/ and separate __Host realm cookies. The
temporary certificate/key are removed on ordinary runner exit.

Fixtures use `ua-*@example.test` and password `ua-fixture-password-2026` only in
this disposable environment. USER/CUSTOMER pairs share email and verified password
but have separate records and cookies. ADMIN and OPERATOR fixtures use the actual
roles from V2. Tests import production closed domain types and the production
unified-response mapper; SQL is the fixture persistence boundary.

## Coverage and evidence

The serial browser suite covers CUSTOMER-only profile mutation with real CSRF,
USER-only ADMIN and OPERATOR homes, each dual challenge choice, dual existing
session rehydration with local selection and no session issuance, consumed
challenge replay, actual 120-second expiry, logout isolation in both directions,
live USER role loss and role loss between challenge issuance and selection.
Each test has a fresh browser context and scenario-specific fixtures. The runner
restarts the provisioning process before tests so registration budgets cannot
pollute login budgets.

Expiry waits for the server's actual `expiresAt`; it also submits the original
binding nonce after expiry to distinguish server TTL enforcement from browser
cookie expiry. No challenge timestamp or immutable trigger is changed. Expect
the suite to include at least two minutes of intentional waiting.

Logs, HTML report and failure-only traces/screenshots are under
`frontend/ua-real-results/` (ignored by Git). GitHub's separate
`unified-access-real-e2e` job runs the same command with PostgreSQL 16 and uploads
evidence with the exact SHA for seven days. Failure traces can contain fixture
passwords, challenge/cookie/CSRF tokens; they must never be populated with live
credentials. Backend unit, HTTP/schema tests, frontend architecture/lint/unit/build
and backend-less accessibility retain their independent jobs.

Creating this harness is not passing UA-007. Record local/hosted results and exact
SHA honestly in SDD after execution. Removing legacy credential endpoints also
requires the repository-wide consumer inventory and applicable reviews; this
harness does not remove or deprecate them, nor change WIP completion boxes.
