# GPT-6.1 Sol security review — PR #166

- Date: 2026-10-06
- Provider/model/effort: OpenAI / GPT-6.1 Sol / medium
- Reviewer independence: no code or documentation contribution to this PR
- Base: `8e72bb4c6b57fb3f34b1d96919d4c8d6865cdcf4`
- Reviewed head: `fae95f9182c0c86a19c32d5a270ccdeb4d7bcf52`
- PR: https://github.com/AgustinFalcon/storecore/pull/166

## Scope and evidence

Reviewed the complete diff and active SDD for disclosure, shared/per-realm rate
limits, trusted-proxy identity, cookies, CSRF, CORS/Origin, challenge TTL and
nonce binding, replay/races, rollback, subject/role revalidation, V11 ACL and
trigger behavior, SQLSTATE translation, validation and adversarial tests.

- `git diff --check 8e72bb4c..fae95f9`: PASS
- GitHub Verify `37497935693` on the reviewed head: backend and frontend SUCCESS
- Hosted backend evidence includes the full PostgreSQL/Testcontainers suite

## Findings

No P0, P1, P2 or P3 findings remain.

The initial P1 was closed by `ClientAddressResolver`: direct peers cannot spoof
forwarding headers, trusted peers are configured by CIDR, chains are bounded and
walked from the trusted right edge, and missing/duplicate/ambiguous/malformed
evidence fails before consuming the login budget. Unified, selection and both
legacy login routes share that resolver. Nginx and environment requirements are
documented. Strict host/port tests close the subsequent parser edge cases.

Challenge evidence is hash-only, immutable to runtime except the allowed consume
transition, locked and rechecked against database time, and consumed in the same
transaction as session issuance. Infrastructure errors are not masked.

## Verdict

**APPROVED** for the exact reviewed head.
