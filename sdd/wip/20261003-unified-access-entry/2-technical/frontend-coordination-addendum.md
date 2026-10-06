# Frontend coordination addendum

This addendum closes the frontend concurrency and rehydration decisions required
before UA-005 implementation starts. It refines, but does not replace, the
approved backend contract.

## Closed frontend domain

The frontend represents access context, home, return destination, login result,
login stage, session probe result and navigation decision as closed domain
types. Wire values enter through one mapper per response boundary. An unknown
wire value becomes the explicit `Unknown` case and cannot authenticate a
session, install CSRF state or select a route. Components, stores and tests do
not compare raw realm, role, stage or destination strings.

The login flow is an ordered set of step objects with one responsibility each:
credential capture, authentication, optional context selection and completion.
Adding a later step does not modify the behavior of prior steps.

## Selection has two distinct sources

Context selection after a fresh unified login challenge submits the opaque,
single-use challenge to `POST /api/v1/auth/context-selection`. It is never synthesized
from browser state and is not automatically retried.

Context selection after rehydrating two already-valid realm sessions is local
navigation only. It updates the non-secret active-context hint and selects a
home among sessions that were successfully probed. It must not call the
challenge endpoint because no challenge exists and no new session is needed.

## Independent probes and partial failure

CUSTOMER and USER session probes are independent. Their closed outcomes are:

- `Authenticated`: the realm is valid and its CSRF token is installed atomically;
- `Anonymous`: HTTP 401 invalidates only that realm and clears only its CSRF;
- `Unavailable`: timeout, transport failure or HTTP 5xx leaves that realm
  unknown for the current attempt and never erases a successfully probed realm;
- `Unknown`: malformed or unsupported payload fails closed for that realm.

Two `Anonymous` results yield confirmed anonymous state and clear both realms.
When no realm is authenticated and either result is `Unavailable` or `Unknown`,
the aggregate result is the closed `Indeterminate` case: it grants no authority,
does not claim that logout occurred and preserves the last accepted local state
until an explicit successful probe, login or logout supersedes it. One
authenticated session selects that realm even when the other probe is
anonymous, unavailable or unknown; the latter cannot erase the successful
realm. Two authenticated sessions use the active-context hint only when it
names one of those probed realms; otherwise the UI asks the person to choose.
`Unavailable`, `Unknown` and `Indeterminate` never grant authority.

Each realm probe is one atomic accepted result consisting of `/me` principal
(and closed USER roles when applicable) plus its realm-specific CSRF response.
The coordinator stages both responses under the same generation and publishes
`Authenticated` only after both succeed. If `/me` succeeds but CSRF is 401,
timeout, 5xx, malformed or stale, that staged principal is not published; the
realm yields `Anonymous`, `Unavailable`, `Unknown` or is discarded as stale as
appropriate. There is no partially authenticated/read-only realm state.

Only one rehydration flight may run at a time. Concurrent callers share its
result. Each flight carries a monotonically increasing generation; a response
from an older generation cannot overwrite a newer login, logout or probe.
Principal, roles and CSRF are committed together once per accepted result and
per realm.

## Mutation and CSRF rules

Login and challenge-selection POSTs use exhaust semantics while in flight. The
submit action is disabled and duplicate clicks cannot create a second request.
Neither POST is automatically retried by the repository, interceptor or store.
Secrets are cleared from component and flow state after terminal success or
failure.

The unified repository owns CSRF installation for `/api/v1/auth/*` responses.
Those URLs do not identify a realm, so the generic path-based interceptor must
not guess. Only an authenticated mapped response may apply the response CSRF
header, and it applies it to the response's closed authenticated context. A
challenge, anonymous, unavailable or unknown result applies no CSRF token.

Legacy realm-specific calls keep their existing realm-specific CSRF handling
until UA-007. Logout revokes and clears only the selected realm.

A fresh `ContextSelectionRequired` result preserves every already accepted
realm session and CSRF value; it adds only the ephemeral challenge flow state.
An immediate authenticated login or a completed challenge selection replaces
only the principal, roles and CSRF of the realm named by the authenticated
closed result. The other realm remains untouched. A rejected or expired
challenge clears only challenge flow state and cannot log out either realm.

## Navigation and authorization

`/login` is the single visible login entry. Legacy UI session routes redirect
to `/login`, preserving only a validated closed return destination. Backend
legacy credential endpoints remain available through UA-007.

`/user/home` renders actions derived from the closed current USER roles returned
by `/api/v1/internal/me`; the USER session store may not discard those roles.
Unknown roles are not displayed and grant no route. Guards consume only the
coordinator's accepted closed state and redirect unauthenticated entry to
`/login` without initiating login or context-selection side effects.

## Verification gate

UA-005 is complete only with mapper/domain tests (including `Unknown`), an HTTP
contract test for the exact `/api/v1/auth/context-selection` path, the
zero/one/two-session rehydration matrix, partial-failure and stale-response
tests, duplicate-submit tests, response-realm CSRF tests, isolated logout,
role-loss and guard tests, plus accessibility coverage for both login stages and
the dynamic USER home.

UA-007 remains blocked until a real-backend browser E2E covers CUSTOMER-only,
USER-only, dual-realm challenge, dual pre-existing sessions, challenge replay,
expiry, logout isolation and role loss, and until the repository-wide consumer
inventory proves no supported client still depends on a legacy login entry.
