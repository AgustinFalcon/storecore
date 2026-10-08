# Master hardening — logout and customer cart authority

Follow-up maintenance of the archived unified-access contract, based on master
`a653f45af977ad989b62a48ec01a363646207aaf`. This does not reopen UA-005/UA-007,
replace their historical acceptance, or authorize release/deployment.

## Accepted behavior

- Probe cancellation and generation supersession are distinct from effective
  realm revocation revisions. A failed credential attempt (`supersedeProbes`
  with `Unknown`) or another realm's login cannot suppress successful logout
  cleanup. Reload probes cannot restore a realm whose revoke is pending.
- Logout is cold, coalesced per realm and replayable. Successful revoke clears
  that realm's accepted principal/CSRF. Failure releases the pending barrier;
  retry requires a new command.
- While revoke is pending, same-realm login/challenge HTTP, CSRF staging and
  principal acceptance fail closed. Unified credentials cannot determine the
  realm before the response, so they are blocked while any realm is revoking.
  Known other-realm challenge and legacy credential requests remain isolated.
  A new same-realm login is allowed only after the revoke settles; accepting it
  before the old logout's cookie-expiration response would be unsafe.
- The root cart resets and cancels load/add/address/checkout subscriptions
  synchronously on customer actor change, loss, or exit from active CUSTOMER.
  Receipt, selected address and idempotency key cannot carry across actors.
  Address selection survives a refresh only if present in the current set.
- `CustomerCartAccess` is the closed authority shared by CartStore and product,
  cart and checkout controls. Dual sessions with USER active offer explicit
  CUSTOMER selection; they do not display an enabled add action that the store
  silently discards. Unknown and missing customer authority fail closed.

## Local validation — 2026-10-07

- Architecture boundary tests 6/6 and architecture scan: PASS.
- ESLint: PASS.
- Angular compiler application and spec emission, strict templates: PASS using
  `ngc -p tsconfig.app.json` and `ngc -p tsconfig.spec.json`, both with
  `--rootDir src` and output under ignored `.angular/master-hardening-*`.
- Complete alternate Vitest/jsdom run of emitted specs: 39 files, 172 tests PASS.
  Regressions cover cold/coalesced logout, reload/revoke orders, Unknown login
  supersession, same-realm login barriers before HTTP/staging/acceptance,
  other-realm isolation, A→B late results/navigation, address membership and
  shared closed policy/UI/store CUSTOMER selection.
- `git diff --check`: PASS.

## Limits

Standard `npm test` and production `npm run build` were attempted and blocked
by the Windows esbuild/ACL error `Cannot read directory ../../../../../../..:
Acceso denegado`. Alternate ngc/Vitest results do not claim a production bundle
or the normal builder succeeded. No hosted CI or new real-backend browser run
was performed for this maintenance diff.

HTTP testing does not model browser `Set-Cookie` ordering. Real-browser
logout-versus-login cookie-race acceptance remains pending; the local contract
proves that new same-realm authentication requests are not sent while revoke
is pending and no staged/local authority is installed. It does not claim to
serialize server requests from other tabs or callers outside this frontend.
Two independent exact-head reviews and hosted Verify remain merge gates.
