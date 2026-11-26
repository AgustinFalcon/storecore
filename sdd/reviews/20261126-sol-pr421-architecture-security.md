VERDICT: APPROVED

# PR #421 architecture, domain and security review

- Provider: OpenAI
- Model: GPT-6.1 Sol (`gpt-6.1-sol`)
- Effort: medium
- Reviewer: `/root/pcc014_domain_review`
- Date: 2026-11-26
- PR: https://github.com/AgustinFalcon/storecore/pull/421
- Title: `docs: close PCC-014 loyalty contract`
- Reviewed head: `e5de377906420a149bf080ac5ba9eb1a0ad62c00`
- Reviewed base: `e0b918e7e22f0f53d90d6292da9cbb0fc8bdce26`

## Review sequence and scope

Read the GitHub PR title/body and its SDD reason: freeze Policy V1 POINT before implementation so checkout, ledger, expiry, returns and reconciliation have one contract. Confirmed GitHub head/base against local git, then read the complete `git diff origin/master...HEAD`, including the functional spec, technical spec, task status and review-iteration evidence. Applied repository AGENTS, PATTERNS and the dual-Sol rule. This review covers the contract only; the PR adds no runtime code, migration, route, credential or activation.

## Focused validation

- `gh pr view 421 --json title,body,headRefOid,baseRefOid,url`: exact PR identity confirmed. The first sandboxed network attempt was denied; the approved read-only retry succeeded.
- `git diff --check origin/master...HEAD`: PASS.
- `JSON.parse` on `3-tasks/tasks.json`: PASS; PCC-014 is `in_progress`, and PCC-015 through PCC-018 remain `pending`.
- `node --test .github/scripts/repository-hygiene.test.mjs`: PASS, 11 tests, zero failures.
- `node .github/scripts/repository-hygiene.mjs`: PASS, 2,509 tracked files.
- Independent Node/BigInt evaluation of the specified monetary allocation: PASS for 1,000 deterministic positive-base cases, exact total conservation and every item cap. Bases `[1,99999]` centavos with 100 POINT produce `[1,9999]` centavos; one hundred 99-centavo items with 9 POINT allocate 900 centavos. Post-redemption ARS 1,000 less 100 POINT earns zero.

## Findings and decision

No open P0-P3 findings. Closed states and Unknown fail-closed behavior, immutable earning authority, eligibility snapshots, local order/payment binding before remote work, FIFO allocation, conservation, expiry and terminal reservation transitions are consistent. The correction contract separates requested/applied targets, retains original lot expiry, partitions restored credit, and defers the whole correction delta when held units are implicated. Structural order-before-wallet locking and durable idempotent receipts bound concurrent effects. CUSTOMER ownership and ADMIN-only adjustment/recheck preserve authority; recheck cannot manufacture payment or correction outcomes.

The unsafe whole-point-per-item allocation found during draft review is resolved by monetary cent allocation and global cumulative point restoration. The other draft findings are resolved in this exact commit. Conclusions were compared with the independent HTTP/UX reviewer; both lanes agree on approval.

## Residual gates

PCC-014 remains in progress until hosted CI and merge evidence exist. This approval does not complete PCC-015/PCC-016/PCC-017, prove runtime/browser behavior or activate external providers. A production loyalty correction adapter still requires the separately reviewed immutable monetary correction source. Future implementation must prove the tests and privilege/concurrency gates named by the spec.
