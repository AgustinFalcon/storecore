# Progress

2026-11-21, base `4cbd801109e060b1918de55eb1ef16abcc2589da`.

The old journey attempted to select the intentionally disabled Case variant on DEMO-002. The initial Case selection on DEMO-001 had succeeded. Production behavior is correct and unchanged; the test now asserts the disabled specimen and uses active DEMO-004 for its next presentation-reset journey. All original invalid quantity, cart persistence, count and navigation assertions remain.

Validation:

- PDP quantity/navigation regression repeated three times: 3/3 PASS, 12.6s.
- Complete `review-regressions.spec.ts` and `rich-catalog-sc17b.spec.ts`: 16/16 PASS, 1.1m, including responsive/Axe and text resizing.
- `npm run build:demo`: PASS. Existing initial bundle warning remains 1.93 MB versus 1.90 MB warning budget; below 2 MB error budget.
- `git diff --check`: PASS.
- Temporary loopback demo server stopped after verification.

Independent GPT-6.1 Sol medium code/product and security reviews both returned APPROVE: the diff is test/SDD-only, preserves the deliberately disabled DEMO-002 Case variant, uses the existing closed variant type, and does not weaken stock, availability or persistence. PVR-003 remains pending only for the combined branch gate and integration. No PR was created in this implementation task.
