# SC-SURF-21B R6.2 — deterministic correction brief

Status: `CHANGES_REQUESTED`. This brief is not review evidence and does not change the approved `SC-SURF-21A` R6.4 artifact.

Stitch generation is currently blocked by connector quota. When capacity returns, create a new immutable external evidence board; do not treat B as an application route and do not retry the timed-out edit as if it had succeeded.

## Required structure

Use four externally labelled blocks: Demo return, Demo logistics, Real and contingencies. Every scene declares target, role, fixture and applicability outside the product frame. A global Demo banner must not wrap Real scenes. Every command scene shows current context, editable form when applicable, preconditions, allowed action, confirmation and result.

### Demo return — ORD-1015

Canonical facts: Rocío Gil, `rocio@demo.invalid`, `APPROVED / PAID / DELIVERED`, `HOME`, tracking `SC-1015`, `2 × LUM-042 standard × $84.500`, order total `$169.000`, eligibility `2/0/0/$0`.

1. Request one unit: `2/0/0/$0 → 1/1/0/$0`.
2. Receive one requested unit: received `0 → 1`; no inventory or money effect.
3. Inspect through editable notes and an observed result; no diagnosis taxonomy, inventory effect or refund.
4. Dispose in a separate `SELLABLE / DAMAGED` step. Isolated DAMAGED specimen only: physical/reserved/notSellable/sellable `6/1/0/5 → 7/1/1/5`; repeat does not increment. LUM never becomes VLD.
5. Refund one unit with a derived, read-only amount: `1 × $84.500 = $84.500`. Payment remains `APPROVED`; refund `NONE → PARTIALLY_REFUNDED`; refunded `$0 → $84.500`; remaining paid `$169.000 → $84.500`; inventory effect `0`. The command is enabled only for a unit that is received, inspected, disposed and not already refunded. A separate blocked scene shows the unmet precondition, names the missing prior step and has zero inventory, payment or refund effect. Invalid quantity is also blocked.

For applicable commands, duplicate rejection and recoverable failure are separate scenes. A duplicate never mutates and has no blind retry. A recoverable failure renders the complete preserved form and current valid state, then refresh/review/reconfirm. Cancel has no effect. Do not invent the technical idempotency mechanism.

### Demo logistics

Use only the ledger fixtures: ORD-1012 pending, ORD-1013 preparing, ORD-1014 shipped, ORD-1017 ready for pickup and ORD-1019 incident `OPEN → RESOLVED`. Resolving the incident changes only that axis; do not invent delivery, rescheduling, carrier, documents, times, locations or guarantees.

### Real

Use only AdminOrder fields. Do not invent buyer, contact, date or modality. ORD-1015 is delivered; do not offer tracking edit or a shipment transition.

Include an isolated Real contract specimen for an applicable shipment: editable tracking, named confirmation, saving, confirmed result, cancel, recoverable failure with preserved input and fresh-state review, and conflict review without overwrite. It references `shipmentTracking` and `shipmentConflict`; it does not claim carrier acceptance, label creation, delivery, provider guarantee or a mutation of the canonical ledger. Do not apply this specimen to delivered ORD-1015.

Show the only productive whole-order RMA scene with current state, one next command, confirmation and result:

`NONE —RECEIVED→ RETURN_RECEIVED`

`RETURN_RECEIVED` and every other existing RMA state expose no further Real command. `INSPECTED` and `ADJUSTED` belong only to the Demo return flow until a productive contract exists. Commands are not states. Partial quantity, inspection, adjustment, damage disposition, refund, incident and fiscal capabilities remain unavailable read-only explanations without fake disabled controls.

Render `fiscal-status-demo` and `receipt-status` explicitly as non-fiscal informational scenes. They never display an invoice number, CAE, tax document or productive fiscal confirmation.

### Contingencies and UI

Cover all target-applicable loading, read error/recovery, access denied and Unknown scenes. Unknown never prints a raw wire value and exposes no mutation. OPERATOR remains authorized in Demo.

At 390, 768 and 1440 there is no global overflow or lost action. Radio groups use `fieldset/legend`; fields have associated labels; dialogs are named and modal; focus is visible; informational text contrast is at least 4.5:1. No business JavaScript and no conformance claim substitutes for evidence.

## Binary acceptance gate

Both coordinated Astra reviewers must mark every item `PASS` against the generated HTML and screenshots:

1. Exact fixture and zero invented facts, states, capabilities or guarantees.
2. Five complete step objects with guards, confirmations and results; inspection separate from disposition; derived refund.
3. Duplicate and recoverable failure separated; inputs preserved; no duplicate mutation.
4. Exact Real fields, states, commands and action applicability.
5. Complete contextual target state/dialog coverage, including Unknown and access denied.
6. Correct A/B and Demo/Real separation plus measured responsive, semantic, contrast and focus evidence.

Any `FAIL` keeps the artifact and SC21 as `CHANGES_REQUESTED`.
