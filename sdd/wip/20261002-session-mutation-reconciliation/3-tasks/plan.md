# Corrective tasks

- MUT-001/002: implement generation-aware reconciliation and test both shipment/RMA success/error, stale GET cancellation, read failure, pending-action blocking and store disposal — implemented for review.
- MUT-003/004/005: implement separate root realm queues; test rotated-token dispatch across endpoints, errors, cancellation, CUSTOMER serialization, realm independence and CSRF recovery occupying the slot — implemented for review.
- Validation: lint, architecture and TypeScript app/spec passed. Angular focused test runner blocked before tests by local esbuild directory ACL. Alternative source-level Node harness passed against actual Angular/RxJS/store/interceptor sources; it does not substitute for hosted Angular verification.
- Hosted verify and required review/merge gates remain pending for this new delta. No close-out or deployment asserted.
