# Implementation plan

1. Freeze the functional/technical contract through two independent GPT-6.1 Sol
   reviews. No code starts with unresolved P0–P2 spec findings.
2. Implement the checkout sellability/removal/discount vertical and its PostgreSQL
   concurrency/no-effect evidence.
3. Implement strict cart/receipt translation and prove checkout key/navigation safety.
4. Align closed role actions, overview deep links and offers filtered-empty state.
5. Reconcile the productive surface manifest and stale canonical close-out records.
6. Run full local gates and browser acceptance, create the candidate PR, then require
   exact-head GitHub Verify and two independent exact-head code reviews. Remediate and
   repeat until all approve.
7. Add the evidence-bearing close-out commit, re-run Verify/reviews when the code or
   evidence head changes, archive with SDD finish and merge only when green. No
   deploy, live activation or homologation.
