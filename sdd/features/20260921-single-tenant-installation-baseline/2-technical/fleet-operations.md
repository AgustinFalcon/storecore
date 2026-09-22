# Fleet operations — one VM, one merchant, one database

**Status:** TODO-003 complete (documentary). Not a control plane. No commercial payloads, secrets, or shared runtime.

An installation is one merchant, one PostgreSQL, one domain, one VM. Fleet metadata is health/version/backup/rollback only.

## Inventory (per VM)

Record this row in the operator catalog. Never copy order lines, customer emails, payment envelopes or OAuth material into that catalog.

| Field | Source | Must not contain |
|---|---|---|
| `installation_id` | always `1` | merchant selector |
| host / domain | `installation_settings.allowed_host` | alternate store hosts |
| API health | `GET /api/v1/health` → `{ status: "UP" }` | catalog, orders, PII |
| process health | Spring Actuator `/actuator/health` | credentials |
| schema version | `SELECT version FROM flyway_schema_history WHERE success ORDER BY installed_rank DESC LIMIT 1` | customer data |
| app version | deployment artifact id (not a git tag until Sol approves) | secrets |
| last dump id | operator catalog | dump contents |
| last dump Flyway | recorded with the dump | — |

Operator checklist before any backup or rollback:

1. `GET /api/v1/health` is `UP`.
2. `installation_settings` has exactly one row with `installation_id=1`.
3. Confirm the artifact id and Flyway version as a pair.
4. Writers are paused or the dump is a consistent PostgreSQL snapshot.

## Backup

Commands are templates. Replace `$INSTALLATION_DB` with the single database of this VM. Do not commit connection strings.

```bash
pg_dump --format=custom --no-owner --no-privileges \
  --file="$DUMP_DIR/${INSTALLATION_ID}-$(date -u +%Y%m%dT%H%M%SZ).dump" \
  "$INSTALLATION_DB"
```

1. Stop writers or take a PostgreSQL consistent snapshot (`pg_dump --format=custom` of the single database).
2. Store the dump **outside** the VM, encrypted at rest, keyed per installation.
3. Record: dump id, Flyway version, artifact id, UTC timestamp, operator.
4. Exclude application logs that may contain emails or tokens from the fleet catalog; keep them in the installation's own retention.

Restore is the inverse:

```bash
pg_restore --clean --if-exists --no-owner --no-privileges \
  --dbname="$INSTALLATION_DB" "$KNOWN_GOOD_DUMP"
```

Then confirm Flyway version matches the artifact, start API, `GET /api/v1/health` is `UP`, then one authenticated smoke login per realm (customer and user). Do not paste credentials into the fleet catalog.

## Rollback

Rollback is **restore previous dump + previous artifact**. Do not rewrite ledger, checkout claims, or identity sessions in place.

| Situation | Action |
|---|---|
| Artifact and Flyway pair matches last known-good dump | Restore that dump, deploy that artifact |
| Flyway advanced past the old artifact | Block. Take a forensic dump. Wait for a compatible pair |
| Health down after restore | Keep the forensic dump. Do not `flyway undo` |
| Identity/commerce evidence looks wrong | Restore again from known-good. Never UPDATE inbox/ledger/order_items |

Steps:

1. Identify last known-good dump whose Flyway version is compatible with the previous artifact.
2. Take a pre-rollback dump (forensics).
3. Deploy previous artifact, restore known-good dump.
4. Confirm health and that `installation_settings` still has `installation_id=1`.
5. If Flyway advanced and the old artifact cannot read the new schema, rollback is blocked until a compatible pair exists. Never `flyway undo` on identity/commerce evidence tables.

## Out of scope

- Shared control plane, `store_id`, tenant filter, or host-based merchant selection.
- POS/fiscal adapters, Mercado Pago in the browser, or invented webhook signatures.
- Automated tag/release/publish. `sdd/RELEASE.md` still forbids tags until Sol completes the remaining gates.
