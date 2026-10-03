# Session coexistence and context switching

Realm cookies remain independent. The access coordinator may present the active
context, but it cannot grant or copy a session. Switching context requires a
valid session for that realm or a new login/challenge. Logout defaults to the
active context; a future logout-all operation must explicitly revoke both and
have separate tests. Expiration, revocation, or role removal invalidates the
cached home model on the next resolution.
