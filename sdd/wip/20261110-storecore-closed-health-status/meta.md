# StoreCore closed health status

- Feature: `20261110-storecore-closed-health-status`
- Status: `implementation_in_progress`
- Project mode: `brownfield`
- Branch: `codex/storecore-closed-health-status`
- Base: `37d7b86462e05399df3d35b68aedbac9d584d571`

## Scope

Replace the frontend health string with one framework-free closed type and a single wire translator. Unknown or malformed values fail closed and are never exposed as valid status text.

## Boundaries

- Frontend health boundary only.
- Backend `/health` contract remains `UP`.
- HTTP failure remains distinct from an unknown successful payload.
- No provider activation, deployment or homologation.
