# Technical specification

## Shape

`frontend/scripts/showcase/load-storecore-showcase.mjs` is an operator tool,
not a productive repository or Spring bean. It contains:

- `ShowcaseStage`: closed value type with private construction token, static
  instances and the single `fromWire` translator;
- `ShowcaseCapability` and `ShowcaseCapabilityState`: closed allowlists for the
  base modules the showcase may activate and their accepted wire states;
- `ShowcaseConfig`: validates environment and rejects non-loopback targets;
- `HttpSession`: owns one realm's in-memory cookie and rotating CSRF token;
- ordered step objects, each responsible for one stage;
- `ShowcaseLoader`: orders the steps and emits only stage/result summaries.

## Ordered flow

1. preflight public health;
2. ADMIN authentication;
3. idempotent activation through the ADMIN API of `STOREFRONT`, `CATALOG`,
   `PROFILE_CONTENT`, `PAYMENTS_MP` and `MANUAL_FULFILLMENT` only;
4. home and catalog upsert;
5. CUSTOMER login-first, registering only when authentication proves the
   synthetic identity does not exist;
6. deterministic default address;
7. optional idempotent pending checkout;
8. representative cart population;
9. public and authenticated readback verification.

The flow is open to a new step by adding one step object to the ordered list;
existing steps are not rewritten.

## Transport

- Same-origin `Origin` is sent on mutations.
- Cookies use a realm-local in-memory jar.
- `X-CSRF-Token` is captured from login/register and replaced after every
  successful write.
- Responses must use the StoreCore `BaseResponse` envelope.
- Expected status codes are explicit per operation.

## Data set

The initial data set uses synthetic `SHOW-*` SKUs, ARS prices, public HTTPS
image URLs and `.invalid` identities. Stock updates use
`LOCAL_SHOWCASE_RECONCILIATION` as the audit reason.

## Safety

Only `localhost`, `127.0.0.1` and `::1` are accepted. There is no override in
this slice. The database reset remains an operator action targeted at a named
disposable database and is deliberately not automated here.
The installation singleton and first ADMIN remain provisioning prerequisites;
the loader never inserts either directly. Future-optional modules and live
vendor adapters remain disabled.
