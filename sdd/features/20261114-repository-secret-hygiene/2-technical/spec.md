# Technical specification

## Defect

The root repository starts with `*` but then re-allows `backend/**` and
`frontend/**`. With no later sensitive-path exclusions, Git considers files
such as `backend/.env`, `frontend/.env.local`, `backend/private.pem` and
`frontend/private.key` eligible for tracking. Root dumps remain ignored only by
accident of location. Governance text still states that StoreCore has no remote
or runtime implementation.

## Design

1. Keep the current source allowlist, then place explicit security exclusions
   after it so later rules win for every source subtree.
2. Re-allow only inert `.env.example` and `.env.sample` templates. Templates
   must contain placeholders, never usable values.
3. Add `.github/scripts/repository-hygiene.mjs`. A closed
   `RepositoryPathDisposition` owns classification and labels. Its single
   `fromPath` boundary returns `AllowedSource`, `AllowedEnvironmentTemplate`,
   `AllowedSqlAsset`, `ForbiddenSensitivePath` or `Unknown`. Unknown fails
   closed.
4. The gate obtains the authoritative index from `git ls-files --stage -z`; it
   does not trust mutable working-tree copies or scan ignored outputs. Only
   stage-zero regular/executable blobs (`100644`/`100755`) are accepted. An
   unresolved stage, duplicate path, symlink (`120000`), gitlink/submodule
   (`160000`), unknown mode, malformed record or Git/read failure is rejected.
   The gate reads each object by its index object ID through `git cat-file` and
   scans the complete byte stream for private-key headers, GitHub token shapes
   and AWS access-key identifiers. It does not skip content because of size,
   extension or NUL/binary markers; a small carry window preserves signatures
   split across stream chunks.
5. SQL is allowed only under `backend/src/main/resources/db/migration/` and
   `frontend/e2e-real/fixtures/`. A SQL file elsewhere is treated as a dump and
   rejected.
6. Add node tests using a temporary Git repository to prove allow, reject,
   force-add bypass detection, index-versus-working-tree authority, signature
   detection across chunk boundaries and with NUL/padding, unresolved-stage
   rejection, unsupported-mode rejection and unknown fail-closed behavior. The
   test creates only synthetic non-working token shapes.
7. Add a dedicated `repository-hygiene` CI job after checkout/Node setup. It
   runs the tests and current-tree gate. Backend, frontend and real-E2E jobs use
   `needs: repository-hygiene`, so no application build begins before it passes.

## Security boundary

This is a deterministic repository guard, not credential incident response.
If a real credential is later proven to have entered history, rotation happens
first and any history rewrite requires a separately approved runbook because it
changes clone ancestry. No secret value is printed: diagnostics include only
the path and rule identifier.

## Verification

- `node --test .github/scripts/repository-hygiene.test.mjs`
- `node .github/scripts/repository-hygiene.mjs`
- representative `git check-ignore -v --no-index` probes
- relevant full hosted Verify, exact-diff Bug/Product and Security reviews,
  merge and post-merge Verify
