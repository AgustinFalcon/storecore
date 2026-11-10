# StoreCore closed health status

- Feature: `20261110-storecore-closed-health-status`
- Status: `completed`
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

## Closure

- PR: `#239`.
- Candidate head: `35ae0c320408beb368e88b9c38415055b0402404`.
- Verify: `42839213825`, attempt `#2`, backend/frontend/unified-access-real-e2e PASS.
- Two independent GPT-6.1 Sol medium reviews: APPROVE, no P0-P3.
