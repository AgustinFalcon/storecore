# Technical Spec — `storecore-core-v1.0.0`

**Status:** `ready_for_sol_review` · **Fecha:** 2026-09-21
<!-- deprecates: sdd/wip/20260819-store-tenancy-and-profiles/2-technical/spec.md#angular-prototype-and-inmemorycatalogrepository -->

## Architecture

```text
Browser → Nginx per merchant VM → Angular 22 storefront/admin → Kotlin hexagonal API → PostgreSQL
                                                        ├→ Mercado Pago adapter
                                                        └→ Mercado Libre authorized adapter
Fleet control plane → health/version/backup/rollback metadata per VM, no commercial data
```

Kotlin domain has no Spring/JPA/HTTP imports. Application owns ports/use cases; persistence, web, Mercado Pago and ML are adapters. Angular separates domain/application/repository/infrastructure/presentation. Production storefront uses HTTP repositories. Prototype fixtures remain separately marked DEMO.


## Identity boundary TASK-004

Domain declares the cookie/CSRF, opaque-token and bootstrap contracts above. Domain declares `InternalUser`, `Customer`, `Session` and sealed `AuthenticatedPrincipal` (`InternalUserPrincipal(userId, roles)` or `CustomerPrincipal(customerId)`) without Spring/HTTP/JPA. Application owns register/login/authenticate/logout/self-profile/self-address/admin-session-revoke/bootstrap ports plus password hasher, random, clock, audit, rate limiter and transaction. Public routes are customer register/login and internal login. CUSTOMER routes are `/api/customer/me` and owned addresses; USER routes are internal session/login/logout; ADMIN alone may revoke a session with non-empty reason and correlation ID. Missing, expired, revoked or wrong-realm session is generic 401; insufficient role 403; foreign address 404; logout is idempotent 204 after database revocation then cookie deletion. TASK-004 does not expose commercial admin operations.
### HTTP matrix and ownership contract (TASK-004)

All routes are `/api/v1`. A success body and every error use `BaseResponse { code, data, message, errorCode, retryable, traceId }`; `POST logout` is the sole 204/no-body exception. Login/register authenticate only credentials and are CSRF-exempt; every authenticated mutation (including logout) requires the current `X-CSRF-Token` and exact permitted Origin. Authentication and all auth responses are `Cache-Control: no-store`; login/register set the realm cookie and send a CSRF header, never a token in JSON.

| Method | Route | Realm / authorization | CSRF | Main result |
|---|---|---|---|---|
| POST | `/customer/auth/register` | public CUSTOMER | no | body `{ email, password, firstName, lastName }` → 201, customer cookie + CSRF header |
| POST | `/customer/auth/login` | public CUSTOMER | no | body `{ email, password }` → 200, customer cookie + CSRF header |
| POST | `/customer/auth/logout` | CUSTOMER cookie | yes | one conditional SELF revoke, 204 and clear cookie |
| GET | `/customer/auth/csrf` | CUSTOMER cookie | no | 200, new CSRF header; atomically rotates the prior token |
| GET/PUT | `/customer/me` | CUSTOMER | PUT yes | GET subject profile; PUT `{ email, firstName, lastName, phone }` |
| GET/POST | `/customer/me/addresses` | CUSTOMER | POST yes | list/create only subject addresses |
| PUT/DELETE | `/customer/me/addresses/{addressId}` | CUSTOMER ownership | yes | foreign/missing is the same 404 |
| POST | `/internal/auth/login` | public USER | no | 200, internal cookie + CSRF header |
| POST | `/internal/auth/logout` | USER cookie | yes | one conditional SELF revoke, 204 and clear cookie |
| GET | `/internal/auth/csrf` | USER cookie | no | 200, new CSRF header; atomically rotates the prior token |
| GET | `/internal/me` | USER | no | current profile and freshly loaded roles |
| POST | `/internal/admin/sessions/{sessionId}/revoke` | USER + ADMIN | yes | reason + correlation UUID, redacted result |

The request selects only the cookie expected by its realm. Missing, expired, revoked, inactive, wrong-realm or deauthorized identity gives uniform 401; role denial is 403. Address request DTO is `{street,number,city,province,postalCode,isDefault}`; `customer_id` is never client selected. Default-address changes lock/serialize by customer and the partial unique index makes a concurrent second default deterministically retry/conflict instead of creating two. The frontend uses credentials include and keeps CSRF only in memory; it may call GET csrf after a 403 but must not automatically replay a business write.
## Typed capabilities and safety controls

The migration-owned `capability_modules` and `capability_actions` registry is the sole allowlist. The runtime database role has `SELECT` only over both registries and database triggers reject `UPDATE`/`DELETE`; release migrations own additions. There is exactly one installation-scoped configuration per module. V1 accepts only static schemas registered in code: for every currently seeded module, schema version 1 accepts exactly `{}`. A later non-empty parameter requires a new reviewed schema version in code and migration. The client cannot supply a schema, arbitrary JSON key, secret reference/value, boolean flag or unrecognized version.

Every use case calls `CapabilityDecisionService.decide(module, action, actor)` before its side effect. It executes at `REPEATABLE READ` (or one repository query locks and reads the complete decision set) and evaluates: 1) effective kill switch; 2) module configuration; 3) typed action; 4) actor authorization. The normal absence of an active kill continues evaluation; missing/multiple/corrupt configuration, action or actor fails closed. An active kill whose `expires_at <= clock_timestamp()` is invalid or expired and still denies; it is never silently ignored. `DISABLED` denies all. `READ_ONLY` admits only a typed `READ`, `STATUS` or `HEALTH` action. `ACTIVE` admits an allowlisted action only after actor authorization. `PAUSED` and `ERROR` admit only explicit `READ_STATUS`/`HEALTH` and never write, publish, dispatch a worker or call an external system. Error taxonomy is `CAPABILITY_KILL_SWITCH_ACTIVE|CAPABILITY_KILL_SWITCH_INVALID|CAPABILITY_CONFIGURATION_MISSING|CAPABILITY_DISABLED|CAPABILITY_READ_ONLY|CAPABILITY_PAUSED|CAPABILITY_ERROR|CAPABILITY_ACTION_NOT_ALLOWED|CAPABILITY_ACTOR_NOT_AUTHORIZED|CAPABILITY_CONFIG_INVALID|CAPABILITY_CONFIG_VERSION_CONFLICT`; this task exposes typed application errors, not a generic HTTP feature-flag endpoint.

`CapabilityConfigurationService` validates the static schema before persistence and applies `UPDATE ... WHERE id=:id AND config_version=:expected`, incrementing exactly one version; zero rows yields `CAPABILITY_CONFIG_VERSION_CONFLICT` after a safe reread. It depends on TASK-004 internal identity, requires `ADMIN`, non-empty reason and correlation ID, writes an immutable before/after audit record in the same transaction, and cannot delete a configuration. Future-optional modules accept only `{}` and `DISABLED`; changing `future_optional` cannot downgrade around a pre-existing guard. Kill-switch create/remove/replace locks the unique parent `capability_actions(module_code,action_code)` row `FOR UPDATE`, verifies `expected_active_kill_switch_id` under that lock, then locks the active tuple row if present. An active row is removed, never deleted; replacement inserts a new active row with `replaces_kill_switch_id` and the same correlation ID only after the old row is closed. No index depends on `now()`; temporal validation uses `clock_timestamp()` under lock. Runtime receives no direct DML privileges on configuration, kills or capability audit; it invokes the single administration transaction which performs CAS/lifecycle change and immutable audit together.
## Universal Tools profile

`universal-tools-profile@1.0.0` is manifest/config/fixtures. Import checks core compatibility, shows diff, requires explicit merge and appends audit history. It cannot overwrite history, merchant identity, domain rules or secret references.

## Storefront, payment and channel contracts

Public catalog/search queries only active product/variant/category/brand/offer/content records. Cart snapshots original price, discount amount, offer/campaign reference and effective unit price before checkout. Checkout first durably claims `(customer_id, checkout_idempotency_key)` after validating ownership; the `PENDING` claim stores an immutable complete `checkout_snapshot` before creating an order, and the order has a composite reference that preserves claim/customer/key/request-hash identity. The same request hash replays its result, a distinct hash conflicts, and a key never discloses a result across customers. Mercado Pago delivery is authenticated/validated only according to its officially documented contract; immutable `payment_event_inbox` commits idempotently before business state. Before TASK-006, `PAYMENTS_MP` `capability_actions` must allowlist every payment side-effect that `CapabilityDecisionService` will decide — not only `PROCESS_WEBHOOK`. Worker refetch/retry/application/outbox executes afterward through separately mutable processing/delivery records, and state plus application commit atomically.

Customer Orders UI/API requires authenticated customer identity and returns only that customer's orders; admin access is a separate authorization path. Manual fulfillment uses explicit shipment states; real carrier integration is deferred.

WEB stock uses a `reservation_saga_key` lifecycle and one `reservation_line_key` per variant, immutable ledger entries keyed separately by `event_idempotency_key`, and derived balance/safety stock. It consumes only `ACTIVE` reservations with `expires_at > clock_timestamp()`. The expiry worker locks overdue `ACTIVE` rows and atomically appends an expiry-release ledger event, updates balance, and marks each reservation `EXPIRED`. ML account key/listing/variation maps explicitly to SKU. The endpoint authenticates and validates each ML notification according to the officially documented notification contract and configured application/authorized account, then commits its immutable durable envelope before ACK. **v1:** ACK does not invent SALE or mutate balances. **TODO-041:** workers refetch by official resource, derive idempotent canonical sale, emit outbox work and reconcile cursor/snapshot drift through mutable processing/delivery projections. If inbox commit fails it returns retryable failure. A signature is checked only when applicable official platform documentation specifies one; no authentication mechanism is inferred without that contract. Observed remote stock never overwrites ledger.

Manual price/promo administration is the only core price writer. Desired/observed/effective values remain separate; ACTIVE policy windows cannot overlap by listing/currency/scope, and ACTIVE offers require `approved_by` and `approved_at`. A future automation is separate and cannot activate concurrently with manual writer.

## Deferred boundaries

Fiscal is an external-library/repository feature blocked on ARCA D-01..D-07 and Sol GO; no port, endpoint, secret, emission or DDL exists here. Competition, price automation, promotion orchestration, cross-sell, calendar, favorites, loyalty, virtual kits and real carriers are separate deferred features. A typed `DISABLED` capability registration is allowed, but no deferred business persistence, adapter, endpoint, credential, job or external call is introduced by this baseline.

## Installation and immutable evidence

Startup validates exactly one `installation_settings` row with `installation_id=1` before serving traffic. An absent, duplicate or invalid singleton makes readiness fail closed with `INSTALLATION_NOT_PROVISIONED`. Database triggers reject updates/deletes to append-only facts, external envelopes and `order_items`; `checkout_idempotency_claims` rejects identity/snapshot changes while allowing only its state transition, and `orders` rejects evidence changes while allowing lifecycle transitions, and workers write only their `*_processing`/`*_delivery` projections. The separate `storecore-pos-integration-contract-v1` producer WIP may implement pre-adapter PIC work under its own explicit GO; TASK-002 adds no BlackStore persistence, API, adapter or service identity and cannot be used as its evidence.

## Gates

Flyway/Testcontainers validates constraints. Backend/frontend validate architecture, compile, tests and production storefront HTTP boundaries; accessibility/Playwright is a documented residual. Integration gates validate MP/ML official-contract authentication and durable inbox idempotency/ACK. Live refetch/retry/outbox is TODO-041. Sol GO is recorded in `sdd/reviews/20260922-sol-go-core.md`.
