# StoreCore local showcase environment

Feature: `20261108-storecore-local-showcase-environment`
Status: `completed_via_successor_hardening`
Branch: `codex/storecore-showcase-backend`
Owner: StoreCore core maintainers.

## Objective

Populate a named, disposable local StoreCore installation through the existing
HTTP contracts so the real frontend can be demonstrated with credible data.
This slice does not enable or simulate external providers.

## Authority and boundaries

- `AGENTS.md`, `sdd/PROJECT.md`, `sdd/PATTERNS.md` and the frontend HTTP
  contract remain authoritative.
- The loader uses authenticated APIs. It never writes domain outcomes with SQL.
- ADMIN bootstrap remains interactive and outside the loader.
- Mercado Pago, Mercado Libre, ARCA, Correo Argentino, email delivery and the
  live StoreCore/BlackStore connection remain disabled and out of scope.
- A checkout created by this environment remains honestly
  `PENDING_PAYMENT`; no payment, invoice or shipment is fabricated.

## Documentary close-out — 2026-11-10

PR #230 final head `0b3e30adb7db5b38c55090ca431be97045cb9ea1` passed Verify `42455936812` (backend, frontend and unified-access-real-e2e) and merged as `e8d2dcd5699f4c578857b2b4013ebe13cbb66d20`.

Retrospective GPT-6.1 Sol medium reviews on 2026-11-10 found two P2 defects in that historical head: public lookup could treat an inactive product as absent and restore fixture stock, and the workflow replaced immutable action SHAs with mutable `@v4` tags. Both defects are closed by integrated successors: PSD head `9108798818b0217dcf5bb4685f59a195d63637ae` uses ADMIN lookup and preservation checks; commits `57cca3f` and `5bd8fcd` restore immutable CI action pins. Current master `1b1063946e3486f9ef4c2ca61aad66f14260199a` passed Verify `42756672557`. The feature is archived as completed through successor hardening, without claiming live providers, homologation or deployment.
