# Productive routes real integration gate

The canonical execution is the independent `productive-routes-real-e2e` job in
`.github/workflows/verify.yml`. It owns a fresh PostgreSQL **16** service, packages
the exact checked-out backend SHA, builds Production and Demo, checks the matrix,
and runs Spring, production Angular HTTPS and Chromium against real HTTP.
No API response interception or provider simulator belongs to this gate.

The runner accepts only a disposable database named `storecore_ua_e2e` on loopback,
PostgreSQL 16, and an empty public schema. It never resets or drops a database.
The job's database is independent of UA/recovery despite using the same name.
Never target an operator database.

## Build and static checks

Build the working snapshot before runtime:

```sh
# backend
mvn -B -DskipTests package
# frontend
npm ci
npm run build
npm run build:demo
npm run check:psd-real
```

`check:psd-real` includes syntax, environment/evidence security checks, typecheck,
lint and discovery. It does not claim runtime evidence. `npm run verify` remains
the separate frontend architecture/unit/build gate. `test:productive-routes-real`
and `test:psd-real` invoke the same hardened runner.

## Linux runtime isolation

Runtime fails closed outside Linux, as root, or without a root-owned,
non-writable attestation for its exact UID. Native Windows execution is not an
equivalent security gate; use the Linux job or reproduce its provisioning steps.

The workflow installs dependencies before isolation, creates a dedicated
`storecore-psd` user and inserts first-match IPv4 and IPv6 OUTPUT owner rules
rejecting every non-loopback destination for that UID. It verifies both rules
before writing `/run/storecore-psd-egress.json`:

```json
{"uid":12345,"ipv4":"reject-non-loopback","ipv6":"reject-non-loopback"}
```

`uid` must be the actual dedicated user ID, not the illustrative value above.
Only root may create this proof after checking the installed rules. Runtime is
launched with `setpriv --no-new-privs`, an empty initial environment and an
allowlist of process/database/tool paths. Proxy variables, JVM preload options,
Spring configuration and provider credentials are not inherited. The Actions
runner UID and upload step are not blocked. An `always()` cleanup removes only
the two dedicated owner rules and their attestation.

Before Spring starts, Node, JVM and Chromium each pass a loopback positive
control and external connection probes. Numeric IPv4/IPv6 and a reserved hostname
mapped to an external address are checked; Chromium also checks WebSocket
failure. The TCP barrier covers HTTP and WebSocket handshakes for the process
tree. Chromium DNS filtering is additional defense. Failed or unavailable
isolation aborts the gate. The proof is an administrator attestation, not an
independent firewall query by the unprivileged process.

For local Linux execution, reproduce the workflow's dedicated user, owner rules,
reserved-host mapping and proof, then run its exact runtime command. Required
tools: Java 21, Node, Chromium, `psql`, `openssl`, `iptables`, `ip6tables` and
`setpriv`. PG defaults are loopback:5434 and disposable user/password `storecore`.
`STORECORE_UA_JAVA`, `STORECORE_UA_PSQL`, `STORECORE_UA_OPENSSL` may select tools.
Ports 8080, 4301 and 4390 must be free. No provider runs on 4302.

## Preparation and external safety

Flyway applies the current chain (V1–V22 at this cut). Real registration supplies
an Argon2id hash for synthetic identities; SQL bootstrap is limited to installation
and USER roles. The route matrix uses `psd-route-admin@storecore.invalid` separately
from existing journeys. The installation guard protects loading and browsers.

The loader configures V22 manual delivery policy, reads current cart/address
revisions and creates one pending, unaccredited order. Replay validates stable
receipt identities, order count, balances, ledger and preservation of an unrelated
API-created offer. Production restarts with the exact HTTPS installation Origin;
ShowcaseConfig remains HTTP-only.

Mercado Pago is `unconfigured`; identity delivery is `UNCONFIGURED` and its worker
is disabled. The ADMIN safety endpoint verifies every external capability is
`DISABLED`, with no duplicate/missing modules, before and after browser execution.
Loader checks also bracket preparation. These are sequential snapshot checks
inside a disposable installation.

## Acceptance and evidence

The matrix adds 30 leaves at 390/768/1440 px to existing focal PSD cases, plus
redirect/wildcard cases. It checks exact resource readiness, surface identity,
final URL, Axe and reflow. Success requires 90 route acceptance attachments and
no failed/incomplete browser case. The UA/CFE provider-local journey remains
separately classified; it cannot count as disabled-adapter or live coverage.
The skip link must retain that URL and surface before Axe/reflow. Required data
reads require a finished HTTP 200. Only the two Mercado Libre reads accept a
finished HTTP 409 with the closed `CAPABILITY_DISABLED` code, together with the
disabled-module UI; they do not claim an account or provider snapshot.

Only allowlisted evidence under `frontend/psd-real-results/` is uploaded:

- `fixture-receipt.json`: synthetic IDs and readiness data;
- `egress.json`: successful isolation probes;
- `route-census.json`: route/viewport/actor/surface, URL paths, HTTP method/path/status
  and Axe counts;
- `action-census.json`: the 17 closed action identities with owned routes, actor,
  action class, strict evidence mode and browser outcome;
- `runtime-summary.json`: SHA, external safety and outcome counts;
- `route-diagnostics.json`: also on failed route cases, final pathname and request
  method/path/status/terminal phase; no query, fragment, body or request identity;
- sanitized JUnit/HTML: generated case IDs, source locations and closed outcomes;
- process lifecycle logs: names and exit status only.

Raw process logs and Playwright JSON remain in temporary scratch and are removed
at completion. Error bodies, headers, cookies, CSRF, credentials, private TLS,
password hashes, traces and screenshots are not uploaded. Explicit upload paths
exclude Playwright's raw test output; missing required evidence fails the job.
Reproduce failures using the recorded SHA and safe case source locations.
Discovery/typecheck and historical PSD runs are not current runtime evidence.
This gate makes no live provider, production email, deployment or homologation claim.
