# Local desired-stock intent (not remote delivery)

`STOCK_DESIRED_CHANGED` plus `channel_outbox_delivery.status=PENDING` is a **local durable intent**. It is not proof that Mercado Libre received, accepted, or applied a quantity.

StoreCore metrics for this WIP count `PROJECTED`, `UNCHANGED`, `WITHHELD`, and `NO_LISTING`. They may also count withheld snapshots and the age of local PENDING rows. None of those numbers mean a remote publish succeeded. There is no dispatcher in this feature: PENDING is never advanced to SENT here.

Logs emit outcome, listing id, and projection version. They must not include OAuth tokens, credentials, PII, sale payloads, or a claim of remote success.
