# Implementation plan

1. Introduce bounded page input and reusable navigation view model/component.
2. Thread page/size through public catalog HTTP and store; reset only on filter changes.
3. Thread page/size through admin catalog and inventory; label page-scoped summaries.
4. Correct and verify backend bounded-read metadata; add focused unit and controlled-HTTP browser coverage with more than 50 records, then run full gates.
5. Review exact head, archive with `sdd.finish`, run CI and merge only when green.

