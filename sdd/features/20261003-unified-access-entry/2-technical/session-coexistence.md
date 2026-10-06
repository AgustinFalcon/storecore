# Session coexistence and context switching

Realm cookies remain independent. On reload the access coordinator probes both
realms through their existing `/me` and CSRF endpoints. A non-secret active
context hint is accepted only after the matching realm probe succeeds; it never
grants authority. Two valid sessions without a validated hint require explicit
context selection.

The unified response mapper owns CSRF association: after mapping a closed
`Authenticated` result it applies the response header only to that realm. A
challenge applies no CSRF and marks no session authenticated. Switching context
requires a valid session for that realm or a new login/challenge. Logout defaults
to the active context; a future logout-all operation must explicitly revoke both
and have separate tests. Expiration, revocation, or role removal invalidates the
cached home model on the next resolution.
