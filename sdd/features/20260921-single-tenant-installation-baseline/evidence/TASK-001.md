# TASK-001 — Production architecture skeleton

**State:** complete after Sol GO 2026-09-22 (`docs/agent/20260922-sol-go-core.md`). This is not evidence for TASK-004 or catalog HTTP.

## Evidence

- Kotlin domain under `com.storecore/**/domain` has no Spring/Jakarta/JPA imports. `ArchitectureBoundaryTest` walks those sources. The unauthorized `blackstore` companion package was removed from core.
- Production `StoreCoreApplication` does not bind InMemory/Fixture repositories.
- Angular production `app.config.ts` binds only `*HttpRepository`. `npm run check:architecture` passed on 2026-09-22.
- GATE: `mvn test` exit 0 and frontend architecture scan passed the same day.

## Out of this evidence

- TASK-004 cookie/CSRF completeness.
- POS/BlackStore adapter (not authorized by this GO).
- Catalog/checkout HTTP contracts (TASK-005/006).
