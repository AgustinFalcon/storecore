# Functional specification

## Outcome

An ADMIN can open **Apariencia**, see the currently published storefront
identity, preview changes and publish them without redeploying StoreCore. A
successful publish updates the public header, logo, theme colors and footer in
the current browser immediately. A fresh anonymous browser reads the same
published identity from the public API.

## Scope

- business name: trimmed, 2–160 visible characters, no control characters
- optional logo: empty, root-relative `/assets/...`, or absolute HTTPS URL;
  never `data:`, `javascript:`, credentials/userinfo or HTTP
- primary and on-primary colors: canonical lowercase six-digit hex values
- minimum WCAG contrast ratio 4.5:1 for the chosen pair
- optimistic revision/CAS, explicit conflict recovery and audit event
- public read and ADMIN read/write contracts
- closed frontend loading/editing/saving/conflict/error states

## Acceptance criteria

- anonymous storefront reads branding without an authenticated session and only
  while `STOREFRONT/SERVE` permits public reads
- admin read/write requires ADMIN; operators and customers cannot mutate
- write requires same origin, current USER CSRF and `PROFILE_CONTENT/MANAGE`
- successful write rotates CSRF, increments revision exactly once and records a
  redacted audit event in the same transaction
- stale expected revision returns 409 and never overwrites the newer value
- malformed names, logo URLs, colors or insufficient contrast return 400 and
  preserve the published row
- unknown/malformed frontend wire values resolve to safe defaults and never set
  arbitrary CSS or HTML
- public branding snapshots apply monotonically by positive revision: a late
  older GET or late failed GET never replaces the latest valid/published value
- ADMIN editing starts only from a completely valid authoritative snapshot with
  a positive safe-integer revision; malformed admin wire blocks publish rather
  than turning defaults into editable authority
- logout, USER identity change or loss of ADMIN clears the editor snapshot and
  draft, invalidates pending callbacks and prevents overlapping publishes
- logo renders only through an `<img>` URL binding with useful alt text; no raw
  HTML or CSS string injection is introduced; external logos use no-referrer
  and a load failure hides the image without changing the saved setting
- every text/icon consumer rendered directly on the configurable primary color
  uses the validated on-primary color at full opacity; gradients/overlays do not
  alter that pair. Semantic focus/status/accent tokens stay independent
- ADMIN navigation and productive-route manifest expose the new screen
- unsaved changes have discard/leave protection; errors preserve the draft
- conflict reload requires explicit draft discard confirmation; otherwise the
  draft remains visible and publish stays blocked
- home Hero/banner stays owned by the existing content editor
- media upload remains issue #7 and secrets never appear in request/response/UI
