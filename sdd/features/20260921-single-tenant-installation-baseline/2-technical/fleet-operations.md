# Fleet operations — one VM, one merchant, one database

**Status:** documentary runbook for TODO-003. Not a control plane. No commercial payloads, secrets, or shared runtime.

An installation is one merchant, one PostgreSQL, one domain, one VM. Fleet metadata is health/version/backup/rollback only.

## Inventory (per VM)

| Field | Source | Must not contain |
|---|---|---|
| `installation_id` | always `1` | merchant selector |
| host / domain | `installation_settings.allowed_host` | alternate store hosts |
| API health | `GET /api/v1/health` → `{ status: "UP" }` | catalog, orders, PII |
| process health | Spring Actuator `/actuator/health` | credentials |
| schema version | `flyway_schema_history` current version | customer data |
| app version | deployment artifact id (not a git tag until Sol approves) | secrets |

Do not send order lines, customer emails, payment inbox bodies, or OAuth material to any fleet plane.

## Backup

1. Stop writers or take a PostgreSQL consistent snapshot (`pg_dump --format=custom` of the single database).
2. Store the dump **outside** the VM, encrypted at rest, keyed per installation.
3. Record: dump id, Flyway version, artifact id, UTC timestamp, operator.
4. Exclude application logs that may contain emails or tokens from the fleet catalog; keep them in the installation's own retention.

Restore is the inverse: empty or replaced volume, restore dump, confirm Flyway version matches the artifact, start API, `GET /api/v1/health` is `UP`, then one authenticated smoke login per realm.

## Rollback

Rollback is **restore previous dump + previous artifact**. Do not rewrite ledger, checkout claims, or identity sessions in place.

1. Identify last known-good dump whose Flyway version is compatible with the previous artifact.
2. Take a pre-rollback dump (forensics).
3. Deploy previous artifact, restore known-good dump.
4. Confirm health and that `installation_settings` still has `installation_id=1`.
5. If Flyway advanced and the old artifact cannot read the new schema, rollback is blocked until a compatible pair exists. Never `flyway undo` on identity/commerce evidence tables.

## Out of scope

- Shared control plane, `store_id`, tenant filter, or host-based merchant selection.
- POS/fiscal adapters, Mercado Pago in the browser, or invented webhook signatures.
- Automated tag/release/publish. `sdd/RELEASE.md` still forbids tags until Sol completes the remaining gates.
