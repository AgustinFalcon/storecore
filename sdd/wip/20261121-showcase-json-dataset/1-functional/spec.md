# Showcase JSON dataset

Status: implementation authorized for isolated review; no merge or deployment authorization.

## Requirements

- SJD-R01: Optional local JSON dataset; absent input preserves the default showcase.
- SJD-R02: Validate the entire bounded dataset before any HTTP request. Credentials, authority, delivery policy and integrations are never dataset fields.
- SJD-R03: Create missing synthetic products through existing APIs only; preserve all existing products, stock, prices, images and operator home content. Fill home only when empty.
- SJD-R04: Keep the three existing journey SKU identities, independent of array order. Preserve checkout key, offer and customer namespaces. Replay must not duplicate domain writes.
- SJD-R05: Closed schema version with Unknown; immutable translated data; explicit field allowlists; verify created products against imported fields.
- SJD-R06: Reject intra-dataset backend-slug collisions and fixture journey monetary overflow before HTTP. Preserve case-insensitive brand/category identity reuse. Generate editable templates as UTF-8 independently of the shell's output encoding.

## Limits

One regular UTF-8 JSON file, at most 1 MiB; 3–100 products. Exactly one of each canonical journey SKU is required. Initial stock is positive; primary and secondary-cart products need at least two units. Images use HTTPS images.unsplash.com only; no download occurs. The operator runs the loader exclusively: existing GET/PUT APIs do not provide concurrent create-only exclusion.

This is a local synthetic fixture import, not production catalog migration, arbitrary journey design, stock reconciliation or Angular demo-memory editing.
