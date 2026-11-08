# Technical specification

## Shape

`frontend/scripts/showcase/load-storecore-showcase.mjs` is an operator tool,
not a productive repository or Spring bean. It contains:

- `ShowcaseStage`: closed value type with private construction token, static
  instances and the single `fromWire` translator;
- `ShowcaseConfig`: validates environment and rejects non-loopback targets;
- `HttpSession`: owns one realm's in-memory cookie and rotating CSRF token;
- ordered step objects, each responsible for one stage;
- `ShowcaseLoader`: orders the steps and emits only stage/result summaries.

## Ordered flow

1. preflight public health;
2. ADMIN authentication;
3. home and catalog upsert;
4. CUSTOMER register-or-login;
5. deterministic default address;
6. optional idempotent pending checkout;
7. representative cart population;
8. public and authenticated readback verification.

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
