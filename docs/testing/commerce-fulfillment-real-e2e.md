# Commerce fulfillment acceptance

`npm run test:ua-real` discovers `e2e-real/commerce-fulfillment.spec.ts` alongside
the existing unified access suite. Run requirements and disposable database
instructions are in `unified-access-real-e2e.md`. Backend packaging is mandatory.
`npm run check:ua-real` checks syntax, TypeScript and discovery only.

The CFE suite creates unique catalog/customer/address/cart/checkout fixtures via
real HTTP. Dedicated test DB setup uses the audited capability function and
inventory fixture balances. Payment approval is never written into PostgreSQL
by the browser fixture: `scripts/cfe-official-provider.mjs` simulates only the
external provider at `127.0.0.1:4302`. Spring uses its official REST and SDK
signature adapters with local fixture credentials, persists the signed inbox,
and its real scheduled worker creates durable accreditation and WEB SALE.
There are no new production controllers, debug endpoints or schema changes.
Provider simulation is local wiring evidence, not provider homologation.

Four real journeys cover pending commands blocked; paid sequential shipment
with reload; single RMA reception with deferred actions denied and stock
unchanged; and a command committed before response loss, authoritative GET,
replay rejection, next transition and USER logout with CUSTOMER preserved.
The last journey forwards the command to Spring before aborting its response;
it is explicit transport fault injection, not mock command success. A fifth
case intercepts only a read with impossible future values to check safe Unknown
rendering. That case is MockHttp and does not count as real wiring acceptance.

Backend additions assert PENDING payment and CUSTOMER rejection (E01), shipment
dates (E03), exact re-reservation variant/quantity and foreign order rejection
(E04), out-of-order and stock invariants around concurrent actors (E05), and
session/role/CSRF/Origin/capability/ownership rejection (E08).
`JdbcFulfillmentEvidenceBoundaryTest` covers impossible missing/multiple payment
evidence, currency/Unknown and exact actor binding with mocked JDBC rows (E02).
Production currency/FK/unique constraints remain intact. Both persisted USER
roles are allowed; role loss is tested rather than inventing a third role.

Execution status and remaining gates are recorded in the CFE WIP progress.
Discovery/compilation/unit success does not establish PostgreSQL/browser PASS,
clean/upgrade PASS or an exact-head CI/review approval.
