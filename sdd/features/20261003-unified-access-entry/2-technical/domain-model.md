# Domain model

Closed types:

- `IdentityRealm`: `Customer`, `User`, `Unknown` at the wire boundary.
- `LoginResolution`: `Authenticated`, `ContextSelectionRequired`, `Rejected`.
- `LoginStage`: `CollectCredentials`, `Authenticate`, `SelectContext`,
  `CompleteAccess`.
- `AccessHome`: `Storefront`, `Operations`, `Unknown`.

The domain contains no HTTP, Angular, Spring, cookie, or UI imports. Mappers
translate wire data exactly once before stores and views consume these types.
Unknown never authorizes, labels a valid state, or selects a route.

Steps are separate objects: credential collection, candidate authentication,
challenge selection, session issuance, and navigation resolution.
