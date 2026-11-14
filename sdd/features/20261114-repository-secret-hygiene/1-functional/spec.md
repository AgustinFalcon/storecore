# Functional specification

## Outcome

StoreCore rejects a change before application builds when the tracked tree
contains a private environment file, private key, credential container,
database dump, or a high-confidence secret signature. Safe environment
templates, database migrations and named test fixtures remain versionable.

The governance documents describe the repository as an active product with a
remote, pull requests and CI rather than as a pre-coding local-only workspace.

## Acceptance criteria

- `.env` and `.env.*` are ignored at every depth, except `.env.example` and
  `.env.sample` templates.
- private-key and credential-container extensions are ignored at every depth.
- dumps, backups and local database files are ignored without hiding approved
  Flyway migrations or the named real-E2E SQL fixture area.
- a committed-file gate fails on forbidden sensitive paths even if a force-add
  bypasses `.gitignore`.
- the gate fails on private-key headers and high-confidence GitHub/AWS token
  signatures in tracked regular files.
- the gate inspects the exact blobs in the Git index, not mutable working-tree
  copies, and scans their complete byte streams regardless of size or binary
  markers.
- unresolved index stages, symlinks, submodules, unsupported Git modes and
  unreadable blobs fail closed before any application build starts.
- the gate classifies paths through one closed policy type. Unknown policy
  decisions fail closed; views or scripts do not compare scattered labels.
- CI runs one dedicated hygiene job; backend, frontend and real-E2E jobs all
  depend on its success.
- the current tracked tree passes the gate and contains no detected credential.
- no history rewrite, credential rotation or provider homologation is implied.
