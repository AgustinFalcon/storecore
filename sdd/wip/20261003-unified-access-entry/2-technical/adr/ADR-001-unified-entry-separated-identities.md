# ADR-001 — Unified entry with separated identities

## Decision

Expose one public login entry while retaining independent USER and CUSTOMER
principals, cookies, sessions, CSRF state, rate limits, and authorization.

Rate limiting has per-realm failure counters layered under a non-resetting
shared logical-attempt budget. A success never clears another realm's failures.

The backend authenticates candidate identities through ports. It never infers
identity ownership from a shared email. A dual-valid result creates a server-
side challenge with a 120-second TTL and single-use consumption. The anonymous
login response sets a `__Host-storecore_access_challenge` HttpOnly, Secure,
SameSite=Lax cookie containing only a random binding nonce; the server stores
its hash with the challenge, checks the exact Origin on selection, and
atomically consumes nonce and challenge before issuing one realm session.

## Alternatives rejected

- Email-only realm inference: invalid because ADR-003 permits the same email in
  both realms.
- One shared principal/cookie: would cross authorization boundaries.
- Browser-supplied role or actor ID: untrusted and incompatible with closed
  identity types.
- Implicit USER priority: privilege escalation risk.
- StoreCore-to-BlackStore federation in this change: BlackStore has its own
  staff-role contract and currently trusts request headers.

## Consequences

The public UX is unified, but protected navigation remains realm-specific. The
legacy login endpoints remain compatible during migration and are deprecated
only after consumer inventory and E2E evidence.
