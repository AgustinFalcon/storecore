# Technical design

## Boundary and closed types

`ShowcaseDatasetSchema` is the closed schema type: `V1`, `V2` and `Unknown`. `fromWire` is the only wire translator. V1 accepts the exact legacy `image` product field; V2 accepts the exact `images` field. Both translate to one immutable internal `images` array, so loader, tests and catalog commands never branch on raw schema strings.

The filesystem reader remains bounded to one regular UTF-8 JSON file of at most 1 MiB. All products are reconstructed before the loader is created. Unknown versions, extra fields, malformed URLs, duplicate gallery entries and out-of-bound gallery sizes fail before network activity.

## Gallery contract

- V1: exactly one `image` URL.
- V2: exactly two to four distinct `images` URLs per product.
- Internal model: frozen `images`; compatibility getter `image` returns `images[0]` only for existing consumers.
- URL policy remains exact HTTPS `images.unsplash.com`, without credentials, custom port or fragment.
- `toCatalogCommand()` passes the ordered gallery to the existing catalog API.

## Dataset

The committed file is `frontend/scripts/showcase/datasets/ferreteria-demo.json`. It contains 40 products, five per category. Product identity is synthetic and uses the existing `SHOW-` namespace. The three journey SKUs retain their meaning and safe stock. Image sources are public Unsplash image URLs and no runtime downloading is performed by the loader.

## Replay and verification

Creation continues to be create-missing/preserve-existing. `requireCreatedProduct` verifies the complete ordered gallery, price and initial stock only for rows created by the current run. The final readback validates identity for every dataset product. The second run must not create rows or overwrite changes.

## Gates

- Node syntax checks for runtime/test modules.
- Showcase translator and loader tests, including V1/V2 and pre-network rejection.
- Surface-data manifest and frontend unit/build gates.
- Disposable PostgreSQL 16 plus packaged Spring loader twice with direct DB/API readback.
- Real browser journeys for buyer and administrator surfaces, with no live external effects.
- `git diff --check` and strict code/security/product review on the exact candidate.
