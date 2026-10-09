# FE-COMP-06 composition contract

`DemoMarketplaceSnapshot` accepts the modular #187 catalog or the legacy demo
inventory. `marketplaceVariants` delegates availability to `DemoCatalogQuery`,
including reservations, non-sellable units and closed publication/sale states.
Legacy inventory exposes exactly one explicit `SKU:standard` identity per SKU;
it does not fabricate separate stock for package presentations.

Mapping keys and operation replay use SKU plus variant ID. Projection, mapping,
provider-response simulation, sale validation and competitor observations have
separate steps. `DemoMarketplaceSale` delegates inventory consumption to its
port: the eventual application composition must validate and mutate the exact
catalog variant atomically, record the movement and persist the resulting queue.
Its port is invoked only after account, mapping, replay and availability checks.

`decodeMarketplace` is the marketplace persistence translator. Run it after the
catalog has restored its closed values. v5 requires its marketplace aggregate;
legacy v1/v4 snapshots migrate at the existing demo boundary. No v2/v3 migration
claim is made by this rebase. Unknown values never authorize channel writes.

The current route intentionally keeps the legacy inventory runtime. Multivariant
buyer/admin screens, access/session policy and application snapshot composition
remain in #191. Modular variant tests here do not establish browser acceptance
for those screens. This module is a local simulator, with no OAuth, network,
provider dispatcher, scraping or automatic merchant-price writes.
