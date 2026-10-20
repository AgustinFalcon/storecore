# Unified access entry

StoreCore exposes one public `/login` while preserving independent CUSTOMER and
USER principals, cookies, CSRF state, sessions and authorization. Credentials
are resolved by the backend. One valid realm creates only that realm's session;
two valid realms return a short-lived, opaque, one-use context challenge.

The frontend models realms, roles, destinations, stages, probe outcomes and
navigation as closed domain types with explicit `Unknown` cases. A coordinated
set of step objects handles credential capture, authentication, optional
selection and completion. Existing sessions are probed independently and are
published atomically with their matching CSRF and roles; stale generations
cannot overwrite newer login, logout or rehydration state.

Implementation chain:

- #165 `8e72bb4c6b57fb3f34b1d96919d4c8d6865cdcf4`: approved SDD coordination contract.
- #166 `74c7adc9cd8e27cad5926bb46ce01ec605febc3c`: unified backend, durable challenge and shared attempt budget.
- #167 `2ec0af85d77e833300dec7e04dcd00cd6b2fc3b0`: frontend concurrency and rehydration contract.
- #168 `31d1d4590795580fcf737995fc14e53412d89e0c`: one login UX and closed frontend implementation.
- #169 `99380a656562c784dc8fc4805eccc2a835a2ea48`: real PostgreSQL/Spring/Angular/Chromium acceptance gate.

The UA-007 inventory found supported executable consumers of the legacy
realm-specific credential HTTP endpoints. They remain supported and
non-deprecated; only their UI routes redirect to `/login`. `TODO-043` owns any
future removal decision.

This archive does not federate BlackStore, deploy, release, activate live vendor
credentials or claim fiscal/ARCA or Correo Argentino homologation.

Post-archive maintenance of logout concurrency and customer cart authority is
recorded in the [2026-10-07 master hardening addendum](2-technical/20261007-master-hardening.md),
with separate local evidence and pending browser/CI/review gates.
