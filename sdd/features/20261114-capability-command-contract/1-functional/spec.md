# Functional specification

## Problem

The productive capability console reads the authoritative module snapshot but
is intentionally presented as read-only. The backend already exposes an ADMIN
state command with CSRF, same-origin validation, optimistic concurrency and an
audit correlation UUID. Without the frontend command contract, an administrator
cannot safely use that existing operation.

## Actors and authority

- ADMIN can read the console and propose a state change for a known server module.
- OPERATOR can read but cannot see or invoke mutation controls.
- Unknown/missing roles cannot read private data or mutate.
- Commercial cards remain explanatory metadata. Only a row returned by the
  authoritative technical snapshot can be a mutation target.

## User flow

1. ADMIN opens a known technical module with a non-null configuration version.
2. The dialog displays current state/version, a closed target-state selector and
   a required reason (1..500 trimmed characters).
3. Unknown module/state, null/invalid version, unchanged target and blank/oversize
   reason fail closed before HTTP.
4. Confirming creates exactly one correlation UUID for that intent and disables
   all overlapping capability writes.
5. Success replaces the matching row with the authoritative response, closes the
   editor, announces confirmation and preserves the rest of the snapshot.
6. A version conflict preserves the draft, refreshes the authoritative list and
   requires explicit review/reconfirmation against the new version; it never
   silently retries.
7. A timeout, transport/5xx failure or unusable/mismatched success response after
   dispatch is `ResultUncertain`: preserve correlation, target and reason, refresh
   the list only for observation, and do not assert success or resend. The dialog
   may be closed and reads remain available, but every capability mutation stays
   blocked for that authentication epoch. Because the server has no correlation
   lookup or UUID deduplication contract, only signing out/re-authenticating (which
   revokes the old session and creates a new epoch) permits a new intent.
8. Authorization loss clears the private snapshot and draft. Actor/session changes
   cancel or discard late reads and mutations from the previous actor.

## Acceptance criteria

- FC-01: module and state remain closed domain objects from mapper through view;
  unknown wire values render neutral and cannot be sent.
- FC-02: ADMIN-only mutation sends `{state, expectedConfigVersion, reason,
  correlationId}` to `POST /user/capabilities/{module}/state`.
- FC-03: one click/intent yields one UUID and at most one in-flight POST.
- FC-04: success uses the returned snapshot rather than predicting version/state.
- FC-05: conflict preserves draft, refreshes, and requires reconfirmation.
- FC-06: uncertain result is distinct from rejected/conflict/confirmed; no retry is
  inferred from matching state alone and no new mutation is allowed in that epoch.
- FC-07: OPERATOR remains read-only; Unknown role/module/state/version fails closed.
- FC-08: late responses cannot repopulate another actor or overwrite a newer read.
- FC-08a: re-authenticating the same id/roles still invalidates the old draft,
  pending write, result and dialog because the authentication epoch changed.
- FC-09: keyboard/dialog focus, live result announcements and 390/768/1440 layouts
  remain usable; existing seven commercial cards and technical rows are preserved.
- FC-10: no capability is changed by tests or startup outside explicit disposable
  fixtures; this delivery does not activate any provider integration.
