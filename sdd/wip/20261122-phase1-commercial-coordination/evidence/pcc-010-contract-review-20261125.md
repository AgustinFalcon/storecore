# PCC-010 reporting contract review evidence — 2026-11-25

## Authority audit

Two independent GPT-6.1 Sol reviewers audited the existing StoreCore writers, migrations and BlackStore integration before the contract was drafted. The audit admitted immutable order/application/ledger/disposition facts and the current inventory snapshot, while rejecting raw payment status, raw order status, inferred BlackStore commerce, catalog-token freshness and reconstructed historical balances as authority.

The audit established that applied payment facts are selected by immutable `PAYMENT_ACCREDITED.applied_at`, not by order creation time; later proven terminal payment evidence preserves historical gross accreditation but cannot provide a refund amount. It also established that inventory ledger event deltas cannot be summed across reservation and sale types as an available-stock change, and that pre-disposition return receipt rows are operational/restatable rather than immutable history.

## Closed contract

The functional and technical SDD now define:

- strict merchant-timezone local-date periods with independently resolved exclusive bounds;
- a canonical period token that detects configuration changes before follow-up/export;
- closed availability, source, time-basis, freshness and reason vocabularies;
- lossless ARS decimal, unsigned Long and signed quantity wire formats;
- exact StoreCore admitted metrics and explicit unsupported/net/reversal cases;
- BlackStore stock diagnostics without monetization, remote heartbeat or false zero;
- one read-only repeatable-read snapshot per response without treating generated time as a commit watermark;
- bounded dashboard collections and a separate all-or-nothing CSV route with formula-injection protection.

## Review findings and repair

The first strict review returned `NO-GO` with P2 findings: signed inventory deltas conflicted with an unsigned wire; export could reinterpret a period after a merchant-zone change; current terminal payment state could erase a valid historical accreditation; missing BlackStore balances could become zero through the existing catalog adapter; collections/export were unbounded; and generated time overclaimed snapshot timing. It also identified a P3 overclaim that return receipt quantities were immutable before disposition.

The contract was repaired with a checked signed quantity type, period token and stale conflict, terminal-evidence rules that preserve gross history, independent balance proof, fixed 20/50 dashboard bounds, a 50,000-row all-or-nothing CSV limit, explicit MVCC timing language and operational/restatable return receipt semantics. Required adversarial tests were added to the implementation gate.

Both reviewers then returned `APPROVE` with no remaining P0–P3 findings. `tasks.json` parses and `git diff --check` passes.

## Boundary

PCC-010 closes only the reviewed contract. PCC-011 implementation, frontend reporting, browser validation, hosted CI and merge remain pending. No GitHub or production result is claimed; local GitHub authentication is currently invalid.
