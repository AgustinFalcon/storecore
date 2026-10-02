# Implementation and validation — 2026-10-01

Base a8874ad; branch fix/int-ml-account-status-closed-type. Changes are uncommitted for principal review. No GO, dual review, hosted CI, live or merge result is claimed.

- MLAS-001: Commerce.kt owns a ChannelAccountState account view with derived authorization; JdbcMercadoLibreService translates DB states via the existing fromWire and uses Disabled for absence; MercadoLibreAccountResponse serializes the flat wire shape in infrastructure; controller uses this adapter.
- MLAS-002: MercadoLibreAccountStatus is closed; user entity/store carry it; HTTP mapper translates once and denies authorized on inactive/Unknown; view renders its label.
- MLAS-003: MercadoLibreAccountStatusTest covers the backend translator, inactive Unknown and flat JSON serialization. Frontend status spec covers known/unknown/malformed wires; view spec exercises the mapper and render, including inconsistent authorized=true states.

Local checks passed: frontend architecture scan, ESLint, TypeScript app/spec type checking, Angular ngc app/spec template checking, git diff --check.

Local executable tests remain unverified: npm run verify reached ng test but native esbuild failed before compilation with Cannot read directory ../../../../../../..: Acceso denegado and unresolved entries across the suite. Maven targeted test did not start: Error computing real path from the worktree; direct JVM Maven launcher reproduced the environment limitation. These are blocked runs, not passing tests. Principal/hosted verification is still required, as are the repository review gates.

Frontend dependencies are reused through an ignored node_modules junction to the existing validation checkout; no lockfile/dependency change belongs to this cut.
