# StoreCore global R8 closure — 2026-11-05

## Certified scope

- Base: `1c58cf7` (`fix(storecore-demo): close customer administration`).
- SDD: `design/storecore-global-r8-closure-addendum.md`.
- Demo: exact surface identity for 26 routes, explicit Not Found, buyer SC04/05/07–10, SC15 incident projection, SC20/21 canonical versus Legacy/Unknown composition, typed inventory returns and executable CTA inventory.
- Real: explicit Not Found/entity miss, commercial checkout copy and merchandise total in the backend's decimal currency units.

This cut does not claim backend integrations, remote CI, deployment, provider homologation, Docker packaging or BlackStore completion.

## Corrections discovered by the global gate

1. A denied Demo login wrote a session generation and consumed the pending intent before authorization. The effects now occur only after the access gate.
2. Unauthorized SC21 Legacy detail lacked the same login/retry recovery as canonical detail. Recovery is now consistent without reading private order data.
3. Pre-R8 CTA scenarios still expected operational commands on Legacy purchases. Dead controls were removed and the matrix now proves the read-only disclosure and safe return.
4. Legacy order navigation from SC22 lost the typed inventory return. The read-only detail now preserves the inventory destination, filters and SKU focus.
5. Campaign focus checks raced Angular phase focus. The E2E now waits for the contractual focus target before testing the focus trap.
6. The archived-cart regression expected the old checkout wizard. It now verifies the immediate availability gate, explicit cart review and targeted removal.
7. Astra found a Real checkout P1: prices already arrive as decimal currency units, but the formatter divided them by 100. The formatter now keeps the mapped units; the test crosses `mapCart` and covers decimal cents.

## Reproducible gates on the final source

- `npm run verify`: architecture **7/7**, lint PASS, unit/component **925/925**, Real build PASS.
- `npm run test:demo`: **329/329 PASS** in 17.5 minutes, one worker, no skipped cases.
- CTA matrix inside the full run: **27/27 PASS**, including the global zero-unexecuted-CTA assertion.
- `npm run test:a11y`: Real **44/44 PASS** after the currency fix. Expected proxy refusal is exercised as an honest no-backend state; the runner exits 0.
- Real checkout currency focal: **1/1 PASS** using mapped `12500.25` and `3000` values, total `34000.5`, rendered `34.000,50` ARS.
- Campaign focus stabilization: **10/10 PASS** across 320/390/768/900/1440, repeated twice.
- No listeners remain on ports 4390/4391 after the gates.

## Independent reviews on the corrected diff

- Astra product/UX/code: initial `REQUEST CHANGES` for the Real currency P1; corrected diff re-reviewed as **APPROVE**, no P0–P3 remaining.
- Astra security: **APPROVE**, no P0–P3. Authorization-before-read, Legacy/Unknown command isolation, session mutation ordering, password RAM-only handling, closed recovery destinations and unsafe sinks were inspected.

No reviewer edited source. Reviews cover the local diff against `1c58cf7`; the commit is created only after this evidence is recorded.
