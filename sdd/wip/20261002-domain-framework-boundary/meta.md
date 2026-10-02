# Domain framework boundary — issue #146

Status: implementation_published_hosted_verified; required reviews and integration pending. User authorized the scoped corrective implementation on 2026-10-02. Base: integration/storecore-int a8874ad. Published as PR #150; hosted Verify PASS for `66a334b`, run `37037871974`, as recorded in progress.md. No Sol GO, required dual Grok approval, merge, release, master promotion or live approval is asserted; revalidation after changes remains required.

This frontend-only cut separates 31 existing use cases from Angular DI and repairs the architecture gate. Roles #144, finite-state changes, backend, APIs, permissions and business behavior are outside its scope.
