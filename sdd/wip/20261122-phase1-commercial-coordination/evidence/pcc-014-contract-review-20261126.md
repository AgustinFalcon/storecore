# PCC-014 loyalty contract review — 2026-11-26

## Scope

Contract-only closure for Policy V1 POINT loyalty before PCC-015 implementation. This cut changes the functional/technical SDD and marks PCC-014 `in_progress`; it adds no migration, route, runtime bean, scheduler, credential or provider activation.

Base reviewed: `origin/master` at merge `e0b918e7e22f0f53d90d6292da9cbb0fc8bdce26` (PR #419).

## Independent review iterations

Two independent GPT-6.1 Sol reviewers at medium effort reviewed the contract in parallel and shared conclusions:

- domain/concurrency lane: `/root/pcc014_domain_review`
- HTTP/security/UX lane: `/root/pcc014_api_review`

The initial draft was `CHANGES_REQUIRED`. The reviews required exact closure of:

1. immutable `PAYMENT_ACCREDITED` earning authority and an eligibility snapshot that does not infer outlet/tax status from current catalog data;
2. promotion of a real `QUOTED` hold to `PAYMENT_PENDING` in the local order/payment transaction before any remote operation;
3. lot conservation, FIFO allocation, original-expiry restoration, recovery obligations and all-or-nothing held corrections;
4. distinct reconciliation kinds/effects for reservations, earnings and corrections, with `RECHECK` unable to invent an outcome;
5. exact CUSTOMER/ADMIN routes, realm authorization, CSRF, receipts, lost-response recovery and principal-bound frontend state;
6. post-redemption earning basis and deterministic monetary discount allocation by ARS minor units rather than unsafe whole-point allocation per item.

After four iterations both reviewers returned `APPROVED` with no open P0-P3. This is draft-contract approval only; formal PR reviews must be repeated against the final exact head SHA and persisted in `sdd/reviews/` before merge.

## Deterministic checks

- `git diff --check`: PASS.
- `tasks.json` parse through `JSON.parse`: PASS.
- Domain reviewer exercised the cent-allocation rule over 1,000 deterministic cases: allocation sum and per-item cap passed.
- Tiny-line examples passed:
  - bases `[1, 99999]` centavos with `100 POINT` allocate `[1, 9999]` centavos;
  - one hundred bases of `99` centavos with `9 POINT` allocate exactly `900` centavos without exceeding any item.

## Decisions and residual gates

- PCC-014 remains `in_progress` until its PR has exact-head dual Sol approval, hosted CI and merge evidence.
- PCC-015 is not authorized by this file alone. It starts only after the contract PR lands.
- Production return/refund loyalty correction remains without an adapter until a separately reviewed immutable monetary correction source exists. PCC-015 may implement the pure port/persistence contract and tests, but cannot monetize RMA quantities or provider JSON.
- No external provider, SMTP, BlackStore, fiscal or carrier activation is claimed.
