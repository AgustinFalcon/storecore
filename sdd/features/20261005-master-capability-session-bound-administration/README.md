# Session-bound capability administration on master

StoreCore capability administration now requires the authenticated internal
USER session at the PostgreSQL mutation boundary. Configuration change and
kill-switch create, remove and replace validate a live session, active user and
current ADMIN membership before effects.

The forward-only V10 migration leaves V1–V9 immutable, retires runtime/PUBLIC
access to all six actor-only overloads, preserves optimistic concurrency and
auditing, and aligns database lock order with the HTTP CSRF coordinator. JDBC
callers pass the server-authenticated principal's session ID; no new HTTP input
or actor-only fallback was introduced.

Validation: local Kotlin main/test compilation passed; GitHub Verify run
`37337967180` passed backend and frontend on implementation head
`c5926cb2b8618d6a025970dd9a6904e485de4777`; two independent GPT-6.1 Sol reviews
approved that exact head with no P0–P3 findings.

This is a master-only hardening slice. It does not implement Tx-C, activate
BlackStore, promote the divergent integration branch, deploy, release, or claim
fiscal/Correo homologation.
