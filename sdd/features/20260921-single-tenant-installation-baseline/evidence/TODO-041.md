# TODO-041 — Official refetch and apply

**State:** complete in-repo. Live vendor HTTP stays installation-configured and out of CI.

## Evidence

- `OfficialResourceQueryPort` + `UnconfiguredOfficialResourceAdapter` (default `configured()==false`).
- `InboxApplicationWorker` claims `RECEIVED` inbox rows, refetches, applies payment status / one ML `channel_sales` row, writes outbox/reconciliation.
- Unconfigured process leaves `RECEIVED`. CI fake proves apply + idempotent second pass.
- No invented HMAC. No secrets in repo.

## GATE

`InboxApplicationWorkerTest` and the unconfigured assertion in `CommerceHttpIntegrationTest`.
