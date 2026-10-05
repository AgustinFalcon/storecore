# Functional specification

## Problem and intended behavior

An actor ID alone is insufficient authority for a privileged capability mutation.
Configuration change and kill-switch create/remove/replace require a real,
unrevoked, unexpired USER session belonging to the actor and a currently active
user with the ADMIN role. Authorization is checked again at the database boundary,
even if the HTTP request has already authenticated successfully.

## Acceptance requirements

- CSA-F01: A valid ADMIN USER session can perform all four existing operations,
  preserving version checks, module binding, kill-switch lifecycle and audit.
- CSA-F02: Missing, unknown, revoked, idle-expired or absolute-expired sessions
  fail closed with `CAPABILITY_ACTOR_NOT_AUTHORIZED` and no mutation or audit insert.
- CSA-F03: A CUSTOMER session, a session belonging to another actor, an inactive
  user, an OPERATOR-only user or a user whose ADMIN role was removed is rejected.
- CSA-F04: Runtime callers cannot invoke any of the six legacy actor-only
  administration signatures. No implicit actor-only fallback is permitted.
- CSA-F05: Remove/replace still reject a kill-switch ID bound to a different
  module; stale configuration versions and stale kill-switch IDs retain their
  existing conflict behavior. Successful audit records identify the verified actor.
- CSA-F06: Invalid authorization has no partial effects, including during replace.
  Existing same-origin and CSRF enforcement remains required at HTTP entry.

## Domain and boundaries

Reuse `InternalUserPrincipal` with `sessionId`, `InternalRole`, `CapabilityState`
and `InstallationCapabilityModule`. Finite sets remain closed types; persisted
unknown values translate once at the boundary into Unknown and grant no authority.
Domain types do not import Spring, JDBC or HTTP. No new UI state or workflow step
is introduced by this slice.

This is master-only V10 hardening. V1–V9 are immutable. Tx-C, BlackStore operational
integration, aggregate promotion, fiscal/ARCA, Correo, live credentials, activation,
deployment and release are out of scope. No product capability is enabled by V10.
