# Implementation decisions — GO addendum

This addendum closes the brownfield decisions required before UA code may start.

## Shared authentication budget

`LoginAttemptBudget.acquire(sourceIp, canonicalEmail)` is one atomic operation
performed before Argon2 work by each credential endpoint:

- `POST /api/v1/auth/login`;
- `POST /api/v1/customer/auth/login`;
- `POST /api/v1/internal/auth/login`.

The shared rolling budget is five credential submissions per IP plus SHA-256
canonical-email key in fifteen minutes. A unified request consumes one shared
unit although it evaluates both realms. Acquisition and expiry pruning occur
under one per-key lock; concurrent requests cannot all pass the same remaining
slot. Success never clears or decrements this budget or a realm failure bucket.
Realm failure buckets remain separate and record only a rejected candidate.
No key contains a raw email. Expired process-local buckets are removed
opportunistically and the store is bounded by expiry plus a maximum key count;
when capacity is exhausted, new keys fail closed with the generic 429.

Candidate verification and session issuance are distinct ports. Verification
never inserts a session. A unified request performs bounded Argon2 work for
both realms, then the pure resolver yields zero, one or two eligible candidates.

## Challenge transaction and storage

Flyway V11 adds a server-side access-challenge table. It stores only hashes of
the public challenge and binding nonce, exact accepted Origin, eligible subject
IDs, the closed return destination, issued/expiry/consumed timestamps and
redacted audit metadata. It never stores password, raw token, CSRF, session
token or raw email. TTL is 120 seconds. At most one active challenge exists for
the same binding; expired rows are retained as immutable evidence or removed
only by an explicit future retention task.

Consumption is one transaction: lock the challenge, verify token hash, nonce
hash, exact Origin, TTL and requested closed realm, mark it consumed, revalidate
active identity and current known USER roles, and issue at most one realm
session. Any failure rolls back consumption and session issuance, returns a
generic rejection and is not automatically retried. Two concurrent selections
therefore produce one session at most. The challenge cookie is expired on both
successful consumption and terminal rejection.

Both unified POST endpoints require the configured exact Origin. Challenge
selection also has a separate bounded abuse budget of ten rejected selections
per IP plus challenge-hash key in fifteen minutes and returns generic 429.

## Concrete homes and return destinations

The operational home is a new `/user/home` screen showing only links permitted
by the current known USER roles. `/user` redirects to `/user/home`; it no longer
redirects to a login form. CUSTOMER home is `/` and anonymous `/` remains the
public storefront.

Closed destination matrix:

| Destination | Realm | Route | Rule |
| --- | --- | --- | --- |
| `HOME` | CUSTOMER | `/` | always after CUSTOMER authentication |
| `HOME` | USER | `/user/home` | known current USER role required |
| `CATALOG` | CUSTOMER or USER | `/catalog` | public catalog |
| `CUSTOMER_PROFILE` | CUSTOMER | `/customer/profile` | live CUSTOMER session |
| `CUSTOMER_ORDERS` | CUSTOMER | `/customer/orders` | live CUSTOMER session |
| `USER_ORDERS` | USER | `/user/orders` | known current USER role |

Cart, checkout, addresses, detail routes and other administration routes are
deliberately not restored in v1; they fall back to the selected realm home.
`ReturnDestination` v1 has no generic `resourceId`. External origins, schemes,
protocol-relative paths, backslashes, encoded ambiguity, fragments, unknown
query parameters and values over 2,048 characters also fall back to home.

## Rehydration and CSRF ownership

After reload the access coordinator probes CUSTOMER and USER independently
through their existing `/me` plus CSRF endpoints. Zero sessions means anonymous;
one valid session selects that context; two valid sessions use a non-secret
active-context hint only if it matches a successfully probed realm, otherwise
the UI requires explicit context selection. The hint never grants authority.

The unified repository maps the response to closed domain types before effects.
Only an `Authenticated` result may mark a session authenticated and copy the
response CSRF header to that result's realm. A challenge result sets neither
session nor CSRF. `Unknown` clears the attempted unified state and never chooses
a route. Logout continues to revoke and clear only the active realm.

## BlackStore boundary

BlackStore now has its own reviewed staff identity and durable runtime
(`blackstore` PR #25 and `sdd/wip/20261006-blackstore-staff-identity`). StoreCore
does not federate, mint or infer BlackStore identity in this feature. UA-008 is
documentation reconciliation only and is not a dependency of UA implementation.
