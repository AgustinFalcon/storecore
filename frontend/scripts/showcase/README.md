# Local showcase dataset

Run from frontend. Generate an editable template from the existing defaults:

~~~powershell
node --input-type=module -e "import {writeFileSync} from 'node:fs'; import {DEFAULT_SHOWCASE_DATASET as d,ShowcaseDatasetSchema as s} from './scripts/showcase/showcase-dataset.mjs'; const products=d.products.map(p=>({sku:p.sku,name:p.name,description:p.description,brand:p.brand,category:p.category,images:[p.image,p.image+'?auto=format&fit=crop&w=1200'],price:p.price,stock:p.stock})); writeFileSync('showcase-dataset.json',JSON.stringify({schemaVersion:s.V2.wire,products,home:d.home},null,2),'utf8')"
~~~

Edit the file, then select it for the existing API loader:

Node writes UTF-8 directly, including on Windows PowerShell 5.1; shell output encoding does not affect the file.

~~~powershell
$env:STORECORE_SHOWCASE_DATASET_FILE = (Resolve-Path ./showcase-dataset.json).Path
npm run showcase:load
~~~

The usual explicit loopback API/origin and existing ADMIN credentials are still required. Remove STORECORE_SHOWCASE_DATASET_FILE to use built-in defaults. The path is local; URLs are not downloaded as datasets.

The root has exactly schemaVersion, products, and home. Version 1 remains compatible and each product has the exact legacy `image` field. Version 2 is the gallery format and each product has exactly `images` with two to four distinct, ordered URLs. Both versions translate to the same internal gallery model. Home has exactly title and body. Unknown versions or fields are rejected. Text must already be trimmed and contain no controls. Price is positive integer pesos, not a string or decimal. Stock is positive integer initial inventory.

Keep SHOW-TALADRO-18V (pending order/favorite/offer), SHOW-AMOLADORA-850 (one cart unit), and SHOW-SET-MANUAL (two cart units). Product order is irrelevant. The first and third identities require stock at least 2. Add synthetic SHOW-* products up to 100 total. SKU suffix is 1–64 uppercase ASCII letters/digits/underscore/hyphen, starting with a letter or digit.

Limits: file 1 MiB; name 200, description 5000, brand/category 100, home title 200, home body 1000, each image URL 2048 characters; price at most 249999999999; stock at most 1000000. Description alone may be empty. Images must be absolute HTTPS on images.unsplash.com without credentials, nondefault port or fragment. The loader stores the URLs and never fetches them; image availability is a separate presentation-environment check.

The committed presentation dataset is `scripts/showcase/datasets/ferreteria-demo.json`. Select it with `STORECORE_SHOWCASE_DATASET_FILE` to populate the real local API with forty synthetic hardware-store products and multi-image galleries.

Product SKU slugs must be unique. Brand/category names may repeat case-insensitively, but distinct names cannot share a slug within the same entity type: Tool A and Tool-A collide. The backend lowercases, replaces every non-ASCII-letter/digit run with a hyphen, trims hyphens and falls back to item. SHOW-TALADRO_18V therefore collides with SHOW-TALADRO-18V. These dataset collisions fail before HTTP; collisions against unrelated existing database rows remain server-authoritative.

The price ceiling is derived from the backend monetary maximum 999999999999.99: the three cart units plus a reserved shipping share split that maximum four ways. Integer-peso fixture prices round each share down to 249999999999; shipping is limited to 249999999999.99. BigInt cents validate the pending-order subtotal and representative-cart subtotal, each with shipping, before HTTP. A supplied policy fee is checked then; an existing installation's fee is unknown until read, so the authoritative selected fee is checked again before checkout. Operator price/policy drift cannot be predicted from the JSON and is preserved.

Import creates missing products and fills an empty home through existing APIs. It preserves existing stock, prices, images, statuses and home, even when the JSON changes. To see different initial fixture values, the operator must prepare a separate disposable environment. This does not load the Angular demo's in-memory catalog.

Run exclusively while preparing the environment. The existing catalog GET followed by PUT does not provide concurrency exclusion against another writer. Customer, address, offer, checkout key, roles, statuses, integration safety and delivery policy are not JSON fields.

Verification: npm run showcase:test and npm run test:surface-data-manifest use only Node built-ins. Real PostgreSQL/browser replay remains a separate gate.

For the full disposable PostgreSQL/Spring/Angular/Chromium route matrix, set the same dataset variable and run `npm run test:productive-routes-real`. The runner reads and validates the file before provisioning, loads it twice, then executes its buyer and administrator browser suites against those real rows. It still requires a fresh PostgreSQL 16 database as documented in `docs/testing/unified-access-real-e2e.md`.
