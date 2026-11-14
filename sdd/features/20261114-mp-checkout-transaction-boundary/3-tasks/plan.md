# Plan

1. `MP-TX-001` — split local checkout from a fail-soft post-commit attachment
   that preserves the local receipt and rotated CSRF without changing the HTTP
   response.
2. `MP-TX-002` — prove remote create runs outside a transaction after committed
   order/attempt visibility on another PostgreSQL connection.
3. `MP-TX-003` — add a closed persisted-state resume decision; prove a remote
   crash preserves one durable attempt and an effective retry reaches the port
   with the same idempotency identity, while recovery/unknown states never
   trigger a blind POST.
4. `MP-TX-004` — prove capability denial after local commit invokes no remote
   port and still returns the committed receipt plus rotated CSRF.
5. `MP-TX-005` — run local gates, exact-head bug/security reviews, hosted CI,
   merge and post-merge evidence.
