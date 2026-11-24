# PCC-003B — optional notification email outbox evidence

Date: 2026-11-24

## Delivered boundary

- Self-service USER email preference for current active ADMIN and OPERATOR identities with verified current email evidence.
- Closed preference, readiness, template, delivery and failure vocabularies; unknown wire values remain neutral and non-actionable.
- Global notification command UUID registry shared by lifecycle and email-preference commands, including upgrade backfill of historical lifecycle receipts.
- First-alert-only projection into an address-free outbox when readiness is explicitly `READY`; no historical or resubscription backfill.
- Durable eligibility invalidation on email, role, activity or opt-out changes.
- Leased delivery queue with fenced attempts, bounded pre-DATA retries, TTL and terminal `UNCERTAIN` after an unclassified or post-handoff failure.
- Generic operational template that excludes source payloads, customer data, amounts, reasons and producer text.

Production remains `UNCONFIGURED`. This slice adds no SMTP transport, credentials, scheduler, network call or activation claim. The `/user/notifications` screen and route guard remain PCC-004.

## Validation

- Expanded backend matrix: 114 tests across 21 suites, 0 failures, 0 errors, 0 skipped.
- Final PCC-003B focal matrix: 13/13 (`NotificationEmailIntegrationTest` 9/9 and `NotificationEmailDomainTest` 4/4).
- Clean V35 migration and V34 to V35 upgrade, historical receipt registry backfill, strict constraints, no email plaintext, rollback boundaries, durable handoff, fencing, invalidation, retry and uncertainty paths are covered.
- Source and copied V35 migration SHA-256 equality: PASS.
- `git diff --check`: PASS.
- Independent correctness/architecture review: APPROVE, no open P0-P3.
- Independent security review: APPROVE, no open P0-P3.
