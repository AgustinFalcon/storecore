# TASK-012 — Profile import and fleet boundaries

**State:** complete.

## Evidence

- `POST /api/v1/user/profiles/preview` and `/merge` accept `universal-tools-profile` manifests compatible with core 1.x, return `{compatible,version,diff}`, and append `universal_profile_imports`.
- Secret/password/token keys are rejected. Merge cannot overwrite `installation_settings` or mutate audit history.
- GATE: commerce profile secret-rejection case. `mvn test` exit 0 on 2026-09-22.
