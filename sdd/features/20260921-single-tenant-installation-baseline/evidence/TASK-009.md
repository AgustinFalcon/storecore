# TASK-009 — Admin manual promos and content

**State:** complete. Manual writer is the only core price writer.

## Evidence

- `GET/POST /api/v1/user/promos` persist `channel_price_policies` with `writer_kind=MANUAL`. ACTIVE requires approver/timestamp. Overlapping ACTIVE windows fail the gist exclusion.
- Home content admin remains on `/api/v1/user/content/home` with audit.
- GATE: commerce promo overlap/authorization case. `mvn test` exit 0 on 2026-09-22.
