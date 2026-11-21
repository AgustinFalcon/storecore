# Technical design

References: local-showcase-environment SCE, productive-surface-data-parity PSD, productive-real-route-matrix.

`showcase-dataset.mjs` owns ShowcaseDatasetSchema (V1/Unknown), the sole fromWire translator, immutable fixture objects and fixed ShowcaseJourney references. Products have only sku/name/description/brand/category/image/price/stock. Home has title/body. No domain import of HTTP/filesystem.

`read-showcase-dataset.mjs` owns bounded filesystem input selected by STORECORE_SHOWCASE_DATASET_FILE. Open a regular file, read at most limit+1 bytes, decode UTF-8 fatally, parse JSON and translate before constructing the loader. No dynamic imports or evaluation.

Loader accepts the validated dataset as its third constructor argument, defaults to existing content, and uses journey identities rather than positions. Existing stages, realm sessions, CSRF, external-safety, loopback restrictions and readback checks remain authoritative.

Bounds: SKU ^SHOW-[A-Z0-9][A-Z0-9_-]{0,63}$; name 1–200, description 0–5000, brand/category 1–100, title 1–200, body 1–1000. Text is trimmed without controls. Price integer pesos 1–249999999999; stock integer 1–1000000. Image 1–2048, absolute HTTPS exact host images.unsplash.com, no credentials, nondefault port or fragment. Unknown fields and noncanonical types fail. All objects are deeply frozen after explicit reconstruction.

Slug prevalidation mirrors JdbcCatalogService.slug exactly: lowercase, replace [^a-z0-9]+ by -, trim -, fall back to item. SKU collisions reject; brand/category collisions reject only when names differ case-insensitively, matching named() identity reuse. Namespace maps are separate. This validates the entire incoming set before HTTP, not unknown preexisting database rows. Test vectors and a source-contract guard detect backend algorithm drift.

The operational price ceiling divides ArsAmount's 999999999999.99 maximum into four shares: three representative-cart units and one shipping share. Fixture prices are integer pesos, so floor(maxCents/4/100)=249999999999. Shipping <=floor(maxCents/4)=249999999999.99. BigInt cents check 1*primary and 1*cart+2*secondaryCart, each plus shipping. Absent fee uses the reserved worst-case share; a declared localDelivery fee is checked during loader construction before HTTP. The selected authoritative fee is checked again before checkout. Existing operator price/policy drift is not predictable from an incoming dataset and remains server-authoritative.

The README template command uses Node writeFileSync(..., 'utf8'), independent of PowerShell redirection encoding. Its exact script is executed in a temporary directory by a test, and the resulting bytes and reader roundtrip are verified.

Tests cover boundaries, Unknown, input files, first load/replay, reordered journey, imported readback and preserved operator edits. No backend migration or endpoint. Existing rows are preserved even if a subsequent file changes their fields; changing input does not reconcile them.
