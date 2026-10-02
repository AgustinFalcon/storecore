# Domain framework boundary — issue #146

Status: implementation_for_review. User authorized the scoped corrective implementation on 2026-10-02. Base: integration/storecore-int a8874ad. No Sol GO, dual review, hosted CI, merge, release, master promotion or live approval is asserted.

This frontend-only cut separates 31 existing use cases from Angular DI and repairs the architecture gate. Roles #144, finite-state changes, backend, APIs, permissions and business behavior are outside its scope.
