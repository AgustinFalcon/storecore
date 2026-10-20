# FE-COMP-03 — isolated post-sale/refund slice

Date: 2026-10-20
Base: `94ff6124b4149b098904b790086d762e6b2b6216`

## Scope

This split extracts the framework-free post-sale contract that composes with the
FE-COMP-02 catalog/cart ports. It includes closed return/refund states, a single
wire translator, buyer/admin authorization ports, idempotent request keys,
separate decision/reception/inspection/disposition/refund steps, integer-cent
refund allocation and inventory effects only at disposition.

Buyer/operator screens, snapshot composition and browser journeys remain for
the later runtime slices. Shipment, incidents, general inventory, alerts UI,
Mercado Libre and productive provider calls are not part of this commit.

## Local evidence

- `npx tsc -p tsconfig.app.json --noEmit`: PASS.
- `npx tsc -p tsconfig.spec.json --noEmit`: PASS.
- `npx vitest run --globals src/app/demo/postsale --environment jsdom`: PASS,
  3 files / 13 tests.
- `npm run lint`: PASS.
- `npm run check:architecture`: PASS, 6 policy tests and architecture scan.
- `npm test -- --watch=false`: PASS outside the Windows filesystem sandbox,
  84 files / 354 tests. The first sandboxed Angular invocation returned the
  previously documented false `Acceso denegado`/unresolved-file failure; it is
  not counted as product failure or PASS.
- `npm run build`: PASS, product artifact `dist/storecore-frontend`.
- `npm run build:demo`: PASS, Demo artifact `dist/storecore-demo`.
- `git diff --check`: PASS.

No browser/UI gate is claimed by this isolated slice. G-B and G-U are completed
only after the buyer/operator runtime composes these ports and executes J03/J04.
No provider refund, bank movement or fiscal document is represented.
