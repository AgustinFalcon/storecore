# Functional specification — Unified access entry

## US-UA-001 — One public login

An anonymous visitor uses `/login` with email and password. The UI never asks
the visitor to choose CUSTOMER or USER before credentials are verified.

## US-UA-002 — Context-aware home

One valid candidate creates exactly one realm session. CUSTOMER navigates to the
storefront home; USER navigates to the operational dashboard. Anonymous `/`
remains the public storefront.

## US-UA-003 — Ambiguous identity

If both independent identities validate the same credentials, the API returns a
short-lived, opaque, single-use context challenge. The UI offers only the
verified contexts. Selecting one creates only that realm session.

## US-UA-004 — Safe return path

The requested return path is same-origin, normalized, and allow-listed. External
URLs, protocol-relative URLs, malformed paths, and privilege-changing context
parameters are rejected and replaced by the context home.

## US-UA-005 — Session and logout boundaries

Existing realm cookies, CSRF rules, guards, and authorization remain separate.
Logout closes the active context only unless a future explicit "logout all"
contract revokes both sessions.

## Acceptance matrix

- no account, invalid password, inactive account: one generic rejection;
- CUSTOMER only: CUSTOMER cookie and storefront home;
- USER only with known role: USER cookie and dashboard;
- USER without valid role: generic rejection, no session;
- both candidates: challenge, then one selected realm only;
- expired, reused, altered, or wrong-context challenge: generic rejection;
- unknown wire/context: `Unknown`, no navigation and no privilege;
- external return path: rejected;
- no password, session token, or CSRF token in URL, JSON persistence, or logs.
