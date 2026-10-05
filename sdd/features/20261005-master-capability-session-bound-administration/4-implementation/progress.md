# Progress

- 2026-10-05: Read `AGENTS.md`, `sdd/STATUS.md`, `sdd/PROJECT.md`,
  `sdd/PATTERNS.md`, recent WIP conventions and V3/V8/V9 capability boundaries.
- 2026-10-05: Created this WIP with functional requirements, technical V10 contract,
  test obligations and tasks. CSA-001 is documentation-complete; implementation,
  test execution and reviews are pending. This entry is not implementation evidence.
- 2026-10-05: Implemented master-only V10 and coordinated JDBC/fixture cut. The
  four new entry points validate and lock the session/user/membership first,
  acquire their business locks, then repeat the live USER/active-user/current-
  ADMIN and deadline check before any effect. All six actor-only runtime grants
  are revoked and SET-reachable privilege drift aborts the migration. CSA-002
  and CSA-003 are implementation-complete.
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
- 2026-10-05: Second independent GPT-6.1 Sol functional/security reviews of
  `db5ce76dd42a05e847e83b54c3956baeebedea71` both requested changes for the
  business→session lock inversion against HTTP CSRF's session→business order;
  functional review also required the revocation race through the production
  JDBC caller. The working revision now uses session→user→role→business plus a
  post-wait authorization recheck, proves a prelocked session does not retain a
  business lock, and revokes an already-built `InternalUserPrincipal` while
  `JdbcCapabilityService.changeState` waits. These verdicts remain historical,
  not approvals; the final SHA still requires two new independent reviews.
- 2026-10-05: Re-ran isolated local `mvn -DskipTests test-compile` after the
  concurrency regressions and production-caller adjustment: BUILD SUCCESS.
  Database execution remains delegated to GitHub CI because the local Docker
  named pipe is unavailable to this sandbox.
- 2026-10-05: GitHub Verify run `37337967180` passed both jobs on exact head
  `c5926cb2b8618d6a025970dd9a6904e485de4777`: frontend SUCCESS and backend
  SUCCESS with PostgreSQL/Testcontainers. This satisfies the authoritative
  fresh/upgrade, runtime privilege, session matrix and business regression run.
- 2026-10-05: Two new independent OpenAI GPT-6.1 Sol reviews at medium effort
  approved base `fcb431144278ab6cb4836df2e348710f88fa4dae` → exact head
  `c5926cb2b8618d6a025970dd9a6904e485de4777` with no P0–P3 findings. Functional
  review additionally ran its required Bugbot delegate. Both confirmed V1–V9
  blob immutability, caller/session cut, lock-order regressions and no productive
  actor-only fallback. The security review confirmed owners, search path, grants,
  SET-reachable postcondition, revocation/deadline handling and atomic effects.
- 2026-10-05: CSA-004 through CSA-007 are complete. PR #164 remains open and
  unmerged while this honest close-out/archive-only commit receives fresh
  exact-head CI and dual-Sol validation. No deploy, tag, publish, activation or
  release occurred.

## Recorded evidence

Master base and approved implementation head are recorded above. V1–V9 Git blobs
were identical across that comparison; V10 is the only added migration. GitHub
CI is the authoritative database execution. Review records identify provider,
model, effort, exact base/head, checks and local Docker/network limits. The feature
is archived by the documentation commit; merge remains unclaimed until it occurs.

## Persistent limits

Master-only V10. V1–V9 immutable. No Tx-C. No BlackStore operational integration.
No aggregate promotion from `integration/storecore-int`. No live activation,
secrets, fiscal/Correo homologation claim, deploy, tag, publish or release.
