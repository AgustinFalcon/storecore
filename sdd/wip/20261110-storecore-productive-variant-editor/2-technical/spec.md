# Technical specification — productive variant editor

## Existing contract

`UserHttpRepository.saveProduct` already serializes variant `id`, `sku`, `name`, closed `status` and `attributes`. `CatalogService` already persists those values. This cut adds no endpoint, DTO, migration or backend behavior.

## Domain model

`VariantStatus` remains a closed class with private constructor, static instances and the only `fromWire` translator. The type owns the persistability rule:

- `Active`, `Inactive`: selectable and persistable.
- `Unknown`: labelled, not selectable as a supported target and not persistable.

Attribute keys and values are merchant data, not finite states; they remain open strings. Variant identity and SKU remain immutable in the view.

The editor projects non-string JSON values only for display. Updating one value uses the original attribute map and preserves every untouched raw value. Renaming a key to another key already present is rejected before rebuilding the map and surfaces an operator-facing error; no duplicate-key collapse is allowed.

## Responsibilities

- Domain state owns supported status cases and the Unknown rule.
- The view produces immutable `ProductDetail`/`ProductVariant` copies and never mutates the wire object.
- The store validates the command boundary before calling the existing use case.
- The repository remains the single wire translator/serializer.

## Tests and gates

- Closed status round-trip/selectability/Unknown persistence rule.
- View preserves identity and SKU while editing name and attributes.
- Store rejects Unknown before repository invocation.
- Attribute edits preserve untouched number, boolean, object and null values; duplicate-key renames are rejected without emitting a draft mutation.
- Architecture, lint, complete unit suite and production build.
- Two independent GPT-6.1 Sol medium reviews on the exact candidate head.
