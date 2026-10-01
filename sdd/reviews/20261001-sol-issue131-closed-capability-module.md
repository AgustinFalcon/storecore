VERDICT: GO

# Sol validation — issue #131 closed capability module

Three independent GPT-6.1-sol validation lanes reviewed the 2026-10-01 StoreCore horizon at medium effort. The focused implementation scope is approved for `origin/integration/storecore-int` at `a8874ad`.

## Approved scope

- Replace the Kotlin private-constructor `InstallationCapabilityModule` with a sealed type.
- Preserve the 16 console-visible web wires and the hidden `BLACKSTORE_INTEGRATION` wire.
- Translate every invalid value to one hidden `Unknown` case with the fixed wire `unknown`.
- Keep exact, case-sensitive wire matching and one `fromWire` translator.
- Cover every known case, identity, visibility and invalid input in the focused test.

## Explicit exclusions

No controller, persistence model, SQL, Flyway, permission, configuration, frontend, capability activation, companion live, `master`, release, deploy or `/sdd.finish`. `CapabilityModuleView.module` remains a separate boundary-wide follow-up.

This Sol GO does not replace the repository-required dual Grok reviews before merge.
