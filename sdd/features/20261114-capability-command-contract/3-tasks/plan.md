# Task plan

1. **CCC-T01 — Closed domain contract**
   - Add mutation phase, productive target policy and immutable state intent.
   - Encode the published generic transition graph in the state type and cover all
     translators and fail-closed validation.
2. **CCC-T02 — Repository boundary**
   - Add typed use case/repository method and exact HTTP mapping tests.
3. **CCC-T03 — Actor-safe command store**
   - Add draft/pending/result state, single-write fence, CAS conflict refresh,
     independent read/write sequencing, epoch-long uncertain lock and late-response
     suppression including same-principal reauthentication.
4. **CCC-T04 — Productive ADMIN experience**
   - Add accessible technical-row editor and result feedback; preserve OPERATOR
     read-only behavior and all current catalogue/filter/dialog behavior.
5. **CCC-T05 — Verification and delivery**
   - Run focused/full local gates, two independent exact-diff reviews, hosted CI,
     merge, issue closure and post-merge CI with evidence.

The tasks execute in order because the view consumes the closed domain and store,
and no wire or UI implementation may invent a state not present in CCC-T01.
