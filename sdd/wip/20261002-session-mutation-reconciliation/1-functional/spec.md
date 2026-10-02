# Acceptance

- MUT-001: after A → B → A, finishing a pending A shipment or RMA invalidates any A read issued before the mutation finished. Actions remain blocked until a fresh read completes; failed reconciliation exposes an error and no stale actionable order.
- MUT-002: a mutation of A must never replace the visible order B. A disposed view must not initiate reconciliation.
- MUT-003: protected writes within USER share one queue across endpoints and components. CUSTOMER uses an independent queue because its backend token rotates independently. CSRF probes join their realm's queue. Each write reads the current token when actually dispatched.
- MUT-004: a dispatched write survives observer cancellation until the response updates CSRF. A cancelled queued request is skipped. A failed request does not poison subsequent work.
- MUT-005: CSRF_INVALID recovery occupies the same slot until the probe finishes. The original write is not replayed, including uncertain outcomes. USER and CUSTOMER cannot block one another.
