# Return destination policy

The guard maps protected routes to a closed destination before login. The edge
normalizes once and rejects external origins, schemes, `//`, backslashes,
ambiguous encodings, unknown routes, and unbounded query strings. A destination
is allowed only when its context and current permissions match. The backend
remains authoritative even if a client tampers with navigation state.
