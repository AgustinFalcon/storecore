# PCC-006 — commercial calendar contract evidence

Date: 2026-11-24

## Closed boundary

- ADMIN owns create, draft edit, preflight, schedule, pause, resume, cancel, audit and reminder-switch commands; OPERATOR is read-only; SYSTEM owns only clock-guarded activation/completion; CUSTOMER has no calendar route.
- Lifecycle, command, audience, reminder channel, occurrence state, kill-switch state and command result are closed types with Unknown and object-per-transition rules.
- V1 audience is `INTERNAL_ALL` only. Role-specific delivery is deferred because the shared notification inbox has no recipient ACL.
- Local whole-second time plus IANA zone and explicit offset resolves to retained instants. DST gaps reject; overlaps require one valid offset. Window, horizon and duration are bounded.
- Preflight is a ten-minute persisted snapshot of aggregate revision, definition revision and canonical definition hash. Scheduling locks and revalidates the exact approved snapshot.
- Aggregate revision is the CAS token; definition revision changes only on draft edit and becomes the immutable approved definition revision used by reminder occurrence identity.
- Create is idempotent before server event-id allocation and recoverable by command id; every authorized command has private immutable receipt and append-only audit semantics.
- Reminder occurrences are durable and deduplicated. Pause/cancel/switch races serialize at the aggregate; late work is skipped and resume does not backfill.
- PCC-007A persists contracts only. The kill switch defaults to DISABLED and no runner, timer, email or external transport is activated.

## Review rounds

Two independent GPT-6.1 Sol medium reviews first returned CHANGES_REQUIRED for missing graph authority, DST resolution, preflight binding, reminder races, receipt recovery, HTTP policy and bounds. The revised spec closed those items.

A second round found four additional issues: restricted audience on a shared inbox, conflated lifecycle/definition revision, lost CREATE response recovery and EDIT described as both allowed and forbidden. The final revision limits audience to INTERNAL_ALL, separates both revisions, adds pre-id-allocation create replay plus global receipt recovery, and treats EDIT as a definition operation rather than a lifecycle self-transition.

Both final reviews returned APPROVED with no P0–P3. `git diff --check` and JSON parsing of the task ledger pass.
