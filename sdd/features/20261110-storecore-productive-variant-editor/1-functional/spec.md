# Functional specification — productive variant editor

## Problem

The productive ADMIN catalog can load and save products whose variants contain a name, closed status and attributes, but the screen only presents those fields as read-only text. An operator cannot use the already available local contract without leaving StoreCore.

## User story

As an authorized catalog operator, I can edit the presentation of an existing variant and save it through the productive StoreCore flow while its identity, SKU and inventory facts remain protected.

## Acceptance criteria

1. Every existing variant exposes its immutable SKU, editable name and a closed status selector containing only Active and Inactive.
2. Existing attributes can be renamed, edited and removed; a new open key/value attribute can be added.
3. Unknown status is labelled by the domain type and blocks persistence until the operator selects a supported value.
4. Empty variant identity, SKU, name or attribute key blocks persistence with actionable feedback.
5. Saving continues through the existing USER HTTP repository and a reload returns the server representation.
6. The screen does not claim stock, pricing, marketplace or external-provider mutations.

## Out of scope

- Creating or deleting variants.
- Editing variant SKU or identity.
- Adjusting inventory or price per variant.
- Mercado Libre mapping/synchronization and provider activation.
- Demo repository changes.
