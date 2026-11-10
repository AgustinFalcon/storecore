# Plan — StoreCore initial bundle budget

1. Measure and record the production baseline.
2. Review functional and technical specifications with independent senior reviewers.
3. Extract the content leave guard without a runtime component dependency.
4. Convert USER administration leaf routes to `loadComponent` while preserving all metadata and guards.
5. Add focused route-boundary tests.
6. Run local quality gates and compare production bundle output.
7. Run independent final bug/product and security reviews; resolve all P0–P3 findings.
8. Create the PR, pass candidate CI and archive the completed SDD. Delivery then reruns exact-head CI for the archive commit, merges only on green and verifies master CI.
