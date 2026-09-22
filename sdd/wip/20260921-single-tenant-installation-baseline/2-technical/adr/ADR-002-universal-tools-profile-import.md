# ADR-002 — Universal Tools profile is an importable data contract

**Status:** proposed / ready_for_sol_review

## Decision

`universal-tools-profile@1.0.0` contains versioned configuration/fixtures and a `coreCompatibility` range for core 1.x. Import first produces a diff; an authorized operator explicitly chooses merge operations. The system appends an import audit record and never rewrites historical domain data.

The profile may not contain merchant credentials, OAuth secrets, legal identity, fixed hostnames, price-writer behavior or special-case code. It is neither a StoreCore fork nor a separate executable release.

## Consequences

Profiles can evolve independently without turning Universal Tools into a hidden tenant or product branch. Incompatible versions are rejected fail-closed.
