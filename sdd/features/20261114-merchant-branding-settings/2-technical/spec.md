# Technical specification

## Persistence and domain

Migration `V23__merchant_branding_settings.sql` extends the singleton
`installation_settings` row with:

- `branding_revision BIGINT NOT NULL DEFAULT 1 CHECK (> 0)`
- `logo_url VARCHAR(2048) NULL`
- `primary_color CHAR(7) NOT NULL DEFAULT '#0f172a'`
- `on_primary_color CHAR(7) NOT NULL DEFAULT '#f8fafc'`
- lowercase hex checks for both colors

The domain owns `BrandColor` validation/contrast and a sealed `BrandLogo`
(`None`, `RootRelative`, `Https`, `Unknown`). One boundary translator accepts
wire logo input; `Unknown` is rejected on writes and maps to no logo on reads.
URL parsing rejects controls, backslashes, userinfo, fragments, protocol-relative
forms and non-HTTPS absolute schemes; canonical serialization is stored.
`MerchantBranding` contains revision, business name, logo and the two validated
colors. Framework/HTTP/JDBC types do not enter the domain.

`JdbcMerchantBrandingRepository.replace` uses one conditional
`UPDATE ... WHERE branding_revision=? RETURNING ...`; zero rows means
`BrandingRevisionConflict`. It increments the revision and inserts
`MERCHANT_BRANDING_UPDATED` into `audit_events` in the surrounding identity
mutation transaction. Audit payload contains only changed field names, never
the logo URL or user-entered text.

## HTTP

- `GET /api/v1/storefront/branding`: public, cacheable only through an explicit
  short max-age/ETag decision; this cut uses `no-cache` so a reload revalidates
- `GET /api/v1/user/settings/branding`: ADMIN and `no-store`
- `PUT /api/v1/user/settings/branding`: ADMIN, same-origin, USER CSRF,
  `PROFILE_CONTENT/MANAGE`, request `{expectedRevision,businessName,logoUrl,
  primaryColor,onPrimaryColor}`

The controller uses `IdentityMutationCoordinator`, so the branding update,
audit row and CSRF rotation commit atomically. Validation maps to 400, revision
conflict to 409. Public serialization emits canonical safe values only.

## Frontend

The domain defines `BrandColor` and `BrandLogo` closed/value types with a single
`fromWire` boundary and safe defaults. `BrandingPhase` is a closed state type;
views/stores never compare phase strings. A repository port and use cases own
public read, ADMIN read and replace. The HTTP adapter maps `BaseResponse` once.

A root `StoreBrandingStore` loads public branding from `ShellComponent`, applies
only validated `ThemeAppearanceTokens`, and exposes the current identity to the
header/footer. Public read failure keeps StoreCore defaults and does not block
catalog use. The store owns a monotonically increasing read generation and
accepts a valid snapshot only when its revision is not lower than the current
revision. A successful ADMIN publish is an authoritative snapshot: it advances
the generation before applying, so an earlier GET completion/error cannot undo
it. Two public GETs completing out of order also converge on the highest valid
revision. Once a valid snapshot exists, failures never reset it to defaults.

`ThemeAppearance` changes only `--sc-color-theme` and
`--sc-color-theme-ink`. All chrome/header/footer/hero text and icons placed
directly on the configurable theme background use the ink token at opacity 1;
existing opacity or gradient blending is removed from those consumers. Status,
focus and accent tokens are not derived from merchant input. Tests render a
valid pair near 4.5:1 in desktop/mobile layouts and assert the effective branded
foreground/background are the unblended tokens.

`UserBrandingComponent` at `/user/settings` loads the authoritative ADMIN view,
keeps published/draft snapshots, previews only validated colors/logo, protects
dirty navigation, publishes with the expected revision, accepts rotated CSRF
through the existing interceptor/session path, and on 409 preserves the draft
until the operator reloads the authoritative value. A successful publish feeds
the returned value into the root branding store for immediate storefront use.
The editor keys all state and request generations to the authenticated USER id
with ADMIN role. Actor change/logout/loss of role cancels pending GET/PUT
subscriptions, clears authoritative and draft data, and rejects late callbacks.
`exhaustMap` (or equivalent closed busy policy) permits one publish at a time.
Editing/publish is enabled only after a fully valid admin mapper result with a
positive safe-integer revision. A malformed/partial response reports an error,
preserves an existing same-actor draft if present, and cannot become a publish
base. Conflict reload asks before discarding; declining keeps the draft and
blocked conflict state.

The logo view uses normal Angular URL binding, `referrerpolicy="no-referrer"`
for absolute HTTPS sources and a local render-error flag that hides a broken
image. It never fetches the logo from the backend, persists render failures or
rewrites the saved URL.

Add `SurfaceIdentity.Settings` and productive manifest coverage. Add the ADMIN
`UserAction.Settings`; operators do not see or reach the screen.

## Verification

- domain unit tests for color normalization, contrast threshold and logo policy
- PostgreSQL integration tests for public/admin authorization, CSRF, CAS,
  rollback, revision increment and redacted audit
- frontend mapper/type/store/view tests for malformed wire data, safe fallback,
  conflict/draft preservation, live theme application, near-threshold effective
  contrast and role navigation
- deterministic races for old GET after successful PUT, two out-of-order GETs,
  late GET failure, logout/actor change during GET and PUT, and duplicate publish
- route-manifest/architecture/lint/full frontend and backend gates
- two independent exact-diff reviews, hosted Verify, merge and post-merge Verify

No live provider, upload, external image fetch by backend, deploy or homologation
is permitted in this cut.
