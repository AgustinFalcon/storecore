# Storefront design ledger

## Approved anchor

- Surface: `SC-SURF-01`
- Stitch screen: `fc50b7624d004c25a85f22ce700ef5a6`
- Revision: `anchor-v6-approved`
- Status: approved as the visual and interaction pattern for `SC-SURF-01..14`.

The approval covers StoreCore Demo disclosure, deterministic product media, canonical search/catalog/PDP/cart navigation, responsive intent and honest commercial copy. It does not close the full storefront task; each remaining surface still requires its own states, dialogs, responsive evidence and review.

## Remaining surfaces

Static visual specifications are approved through `SC-SURF-14`. Responsive and executable evidence remains pending for every surface until the Angular implementation gate.

## Batch storefront-01

- Surfaces: `SC-SURF-02..05`
- Generated screen IDs: `b1d5f857ce344c40bb199daf60f21745`, `bdb395fb5c074b0e89da7d4d17cd9e18`, `bae8be6f183b4996904e1548abbb3f5c`, `423460710b1145c2aca3d14861aceafa`
- Final screens: `SC-SURF-02` `4db5656e39854e55a0e0ea0fa636ff05`; `SC-SURF-03` `45d86d536cd441ea8857334c08af48f0`; `SC-SURF-04` `fff1fda8df934acb8815c0f82e59c026`; `SC-SURF-05` `696c60073fc449ec85a155e8b23bf1cc`.
- Review: `APPROVE` by UI/UX, frontend delivery and Angular architecture reviewers; zero open P1/P2.
- Closed: fabricated claims, canonical routes, separate state variants, accessible modal/drawer behavior, Outlet versus offers, deterministic media, complete recovery flow, typed return intent, cart conflict/persistence and catalog/PDP roundtrip.

These screens are approved design/prototype references. They do not authorize copying Stitch DOM handlers into Angular; responsive Angular evidence at 390/768/1440 and implementation tests remain later gates.

## Batch storefront-02

- Surfaces: revised `SC-SURF-02`, plus `SC-SURF-06..09`.
- Final static screens: `SC-SURF-02` `5deea948b6614926ab6be4a03f240ed5`; `SC-SURF-06` `3455a89f904d4e49a3d824c4d63e5d7f`; `SC-SURF-07` `4b212a62f7784102a6fbc9baacd83fa6`; `SC-SURF-08` `868e34545849423d98c4c52799959f1a`; `SC-SURF-09` `711b198acd164a79b7b4300df8322d39`.
- Review: `APPROVE` by UI/UX, frontend delivery and Angular architecture reviewers; zero open P1/P2 in the static visual gate.
- Covered: canonical routes, full declared state boards, honest DEMO disclosure, customer profile/address/favorite content, deterministic media, canonical product identities and the SC01 storefront shell.
- Boundary: the final Stitch artifacts are semantic visual specifications without application controllers or browser-storage authority. They do not certify authentication, closed types, persistence, transactions, return-intent execution, keyboard behavior or responsive reflow.

All executable behavior is intentionally deferred to Angular, where the global closed-state/SOLID rule, codecs, `CustomerSession`, `ReturnDestination`, transactional demo persistence and tests are mandatory.

## Batch storefront-03

- Surfaces: `SC-SURF-10..14`.
- Final static screens: `SC-SURF-10` `d57d2daf2f544b0f9a100eeb5bd2ab35`; `SC-SURF-11` `3f0c7aaa45bc435f9be7a417259842ab`; `SC-SURF-12` `36f07d74b7f94cfa99164ddac2e7bd2d`; `SC-SURF-13` `25d1235464f94331b486a29ff463ff71`; `SC-SURF-14` `c04300ff8002416dbc2da34a4bf832a6`.
- Review: `APPROVE` by UI/UX, frontend delivery and Angular architecture reviewers; zero open P1/P2 in the static visual gate.
- Covered: cart conflict and undo, explicit stock reconciliation, checkout method and module blocking, pending/rejected/expired QR outcomes, canonical order routes, delivery-versus-pickup language, post-sale eligibility, six closed fiscal presentation states and non-fiscal demo disclosures.
- Boundary: Stitch remains a static visual specification. It does not certify idempotency, stock reservation, payment reconciliation, fiscal integration, session persistence, keyboard behavior or responsive reflow.
