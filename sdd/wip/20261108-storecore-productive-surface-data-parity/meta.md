# StoreCore productive surface data parity

Feature: `20261108-storecore-productive-surface-data-parity`
Status: `implemented_local_closeout_pending`
Branch: `codex/storecore-production-data-coverage`
Owner: StoreCore core maintainers.

## Objective

Replace the remaining presentation-only StoreCore data paths with explicit,
authenticated HTTP contracts and credible local showcase data. The productive
Angular graph remains separate from the Demo build and never falls back to a
fixture when an API read fails.

## Boundaries

- Single merchant installation; no `store_id` or shared runtime.
- Phase 1 local commerce only. Mercado Pago, Mercado Libre live, ARCA, Correo
  Argentino, competitor intelligence and StoreCore/BlackStore live activation
  remain separate homologation tracks.
- Existing demo screens remain a sales artifact until their productive
  vertical is implemented and independently accepted.
- Every finite state is a closed domain type with one wire translator and an
  `Unknown` case. Views do not compare wire strings.


## Documentary close-out residual — 2026-11-09

All task entries record local implementation evidence. This WIP remains unarchived: its final PR candidate review records (provider/model/effort, base/head, scope, checks and limits) must be reconciled in this feature before archive. A green later master or CFE run does not substitute for feature-specific acceptance. Historical pending/failed entries remain preserved.
