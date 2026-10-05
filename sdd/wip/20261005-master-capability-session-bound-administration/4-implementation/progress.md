# Progress

- 2026-10-05: Read `AGENTS.md`, `sdd/STATUS.md`, `sdd/PROJECT.md`,
  `sdd/PATTERNS.md`, recent WIP conventions and V3/V8/V9 capability boundaries.
- 2026-10-05: Created this WIP with functional requirements, technical V10 contract,
  test obligations and tasks. CSA-001 is documentation-complete; implementation,
  test execution and reviews are pending. This entry is not implementation evidence.
- 2026-10-05: Implemented master-only V10 and coordinated JDBC/fixture cut. The
  four new entry points acquire their business locks before the final live
  USER/active-user/current-ADMIN check; all six actor-only runtime grants are
  revoked and SET-reachable privilege drift aborts the migration. CSA-002 and
  CSA-003 are implementation-complete.
- 2026-10-05: Local `mvn -DskipTests test-compile` succeeded from an isolated
  staging checkout. Testcontainers could not access the Docker named pipe from
  the sandbox, so no database test is marked passed locally; GitHub CI remains
  required evidence for CSA-004/005.
- 2026-10-05: First independent GPT-6.1 Sol functional/security reviews of
  `826ef5926e48fc4344f4ed073ca262a5fe3ac810` both requested changes. Confirmed
  findings were fixed in the next working revision: invalid qualified COALESCE,
  reserved alias, deadline-before-business-lock race, null module binding,
  incomplete four-operation denial matrix and owner-only legacy fixtures. These
  verdicts are not approvals and cannot satisfy CSA-006.

## Evidence to record after implementation

Record master base SHA, change head SHA, migration checksum comparison, fresh and
V9→V10 upgrade results, runtime privilege assertions, session rejection matrix,
business regression results and exact commands. Review records must identify
provider/model/effort, base/head, checks, limits and two independent Sol verdicts.
Do not mark tests, CI, reviews, merge or archive complete without actual evidence.

## Persistent limits

Master-only V10. V1–V9 immutable. No Tx-C. No BlackStore operational integration.
No aggregate promotion from `integration/storecore-int`. No live activation,
secrets, fiscal/Correo homologation claim, deploy, tag, publish or release.
