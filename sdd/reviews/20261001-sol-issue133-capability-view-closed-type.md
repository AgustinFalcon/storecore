VERDICT: APPROVED

# Sol review — issue #133 closed capability read model

## Objective

Close the remaining capability read model boundary identified after issue #131. `CapabilityModuleView` now carries `InstallationCapabilityModule`, while the JDBC adapter translates `module_code` once and the HTTP adapter explicitly emits the canonical wire.

This change is stacked on PR #132 at head `909b8ce`. It does not claim that PR #132 is already merged.

## Decision

- `CapabilityModuleView.module` is the sealed domain type, not a `String`.
- `JdbcCapabilityService.list()` translates database values through the single `InstallationCapabilityModule.fromWire` translator.
- Unknown database values collapse to the fixed hidden `Unknown` case; their raw value is not exposed.
- The console payload filters by `visibleOnConsole` and serializes `module.wire`, preserving the existing JSON string contract.
- Application lookups compare the typed view's canonical wire with the pre-existing command wire without adding aliases, trimming or case folding.

## Evidence

- `InstallationCapabilityModuleTest` covers all known singleton wires, the hidden companion and invalid inputs.
- `CapabilityModuleViewMappingTest` covers known and unknown JDBC-boundary mapping, state/version preservation, exact console serialization and exclusion of companion/Unknown.
- `git diff --check` completed without whitespace errors.
- Local Maven was attempted with `mvn -f backend\\pom.xml "-Dtest=InstallationCapabilityModuleTest,CapabilityModuleViewMappingTest" test`; the Windows sandbox denied real-path resolution before Maven loaded the project, so this is not recorded as a test failure or pass.
- Three independent GPT-6.1-sol medium-effort reviews covered Kotlin/Spring/JDBC, security/fail-closed behavior and SDD/business scope. All returned APPROVED with no P0-P3 findings. These Sol reviews do not substitute for the repository-required dual Grok 4.7 reviews.
- Hosted Verify on the final pushed head remains the executable validation gate.

## Explicit exclusions

No SQL, Flyway, capability state changes, permissions, activation, live integration, frontend, release, `master` promotion or `/sdd.finish`. `CapabilityState.valueOf` and command write types remain separate follow-ups.

## Merge gates

- PR #132 dependency remains explicit until its base is integrated and this branch is updated.
- Backend and frontend hosted Verify must pass on the final head.
- Two authentic Grok 4.7 reviews must approve the PR diff and SDD scope before merge.
