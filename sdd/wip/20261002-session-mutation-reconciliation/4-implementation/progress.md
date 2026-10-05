# Evidence — 2026-10-02

Implemented the two P2 review findings: completion of a pending A mutation after returning A → B → A now forces a fresh GET before releasing actionable state; all protected USER writes and CSRF probes now share root serialization. Added independent CUSTOMER serialization because its backend rotates its own CSRF token by the same coordinator contract.

Changed production files: `frontend/src/app/features/admin/user-order-detail.store.ts`, `frontend/src/app/core/auth/auth.interceptor.ts`, new `frontend/src/app/core/auth/session-mutation-queue.ts`. Regressions live in the existing store and interceptor specs. No backend or domain changes.

PASS: `npm run lint`; `npm run check:architecture` (six Node boundary tests and production scan); `npx tsc --noEmit -p tsconfig.app.json`; `npx tsc --noEmit -p tsconfig.spec.json`; `git diff --check` (only existing LF/CRLF normalization warnings).

BLOCKED: `npm test -- --include=src/app/features/admin/user-order-detail.store.spec.ts --include=src/app/core/auth/auth.interceptor.spec.ts` exited 1 before tests. esbuild/angular compiler reported `Cannot read directory ../../../../../../..: Acceso denegado`, followed by unresolved source/framework/styles entries. No Angular test pass is claimed.

PASS alternative runtime regression: `node C:/Users/agustin/Documents/Codex/2026-10-01/bien/work/storecore-session-regression.mjs`. Scratch harness outside the checkout transpiles actual source modules with the installed TypeScript and loads actual Angular/RxJS/ComponentStore. Direct assertions passed FIFO, queued cancellation, retention of dispatched writes, error isolation, separate realm queues, A → B → A read invalidation/reconciliation and failed-read blocking. Actual interceptor plus Angular HttpTestingController passed delayed second dispatch with the rotated token and holding that dispatch until CSRF_INVALID recovery finishes. This is supplementary local evidence, not the Angular suite or hosted verify.

All invoked local runners exited; no server or background process remained from that local validation. At that historical point no commit, push or PR update had been performed. No dependency/lockfile modification, merge, activation or deployment was performed by this corrective cut.

Subsequent publication: corrective commit `b200711` is in combined PR #135. Hosted Verify run `37078733745` PASS executed against that HEAD. Internal architecture/SDD and functional reviews were obtained; their findings are being reconciled in documentation. Internal review is not GitHub review approval or the mandatory dual Grok approval. Required review/merge gates remain pending; no merge, activation or deployment is asserted.

Follow-up correction on the rebuilt integration head: `SessionMutationCancelledError` is now handled by a generation fence in both `SignOutCustomerUseCase` and `SignOutUserUseCase`. Logout success and error paths clear only the identity generation that started the operation; a stale logout cannot clear a later login's authentication or CSRF state. Added regressions for both realms covering A logout → B login cancellation. This closes the P2 identified by the final Astra/Sol review cycle for head `834c623` (pending re-review and hosted Verify).

The same fence is applied before invoking the backend logout. A delayed successful CSRF probe from logout A now fails with the domain cancellation error after login B and cannot issue a logout request under B's cookie/CSRF. Added CUSTOMER and USER late-success regressions; re-review and hosted Verify remain pending for the resulting head.
