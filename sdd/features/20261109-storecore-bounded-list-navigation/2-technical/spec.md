# Technical specification

## Design

- Add an immutable page request value object (`page`, `size`) at the domain boundary. Page numbers are values, not magic UI strings.
- Extend `CatalogQuery`, `ICatalogRepository`, `IUserRepository` and their use cases with explicit bounded page input.
- Keep the backend endpoint shape unchanged: `page` and `size` query parameters, maximum 50. Correct the read projection so `truncated` means that rows exist after the returned page (`page * size + items.size < total`), with long arithmetic in Kotlin; the frontend validates the same invariant.
- Derive navigation only from validated `ListMetadata`. `totalPages = max(1, ceil(total / size))`; malformed or negative metadata fails closed. An empty response whose requested page is now beyond the last page is a legitimate concurrent shrink: recover once to `max(0, totalPages - 1)` under the same generation, then stop even if the retry is still empty.
- Reuse one presentational pagination component in the three views. It receives metadata/loading and emits the target page; it does not call HTTP. Controls remain mounted and focusable with `aria-disabled` during loading and at boundaries, while guarded events prevent invalid/repeated requests.
- Stores own page transitions. Filter mutations reset public catalog page to zero. RxJS `switchMap` prevents older page/filter publication. Protected admin stores also bind a generation to the current USER principal; actor change/logout clears state and invalidates pending responses.
- Inventory aggregates and filters remain page-scoped and are labelled as such; no client claim of global search.

## Security and architecture

- Existing USER authority, capability, CSRF and realm boundaries are unchanged.
- No view compares wire-state strings. Existing closed product, inventory and read-state types remain authoritative.
- No new backend writer, SQL or external adapter. The only backend change is the bounded read metadata calculation and its contract tests.

## Verification

- Unit: value object/metadata navigation, repositories serialize page/size, stores reset/preserve and ignore stale responses, actor invalidation, one-shot 51→50 shrink recovery, view boundaries.
- Architecture/lint/full frontend tests and production build.
- Backend integration: catalog and order projections prove first-page, last-page and beyond-last-page `truncated` semantics.
- Browser with controlled HTTP: public/admin/inventory keyboard next→previous with more than 50 rows at 390/768/1440, focus retention, filter reset, accessibility and no horizontal overflow.
- Two independent GPT-6.1 Sol reviews plus exact-head GitHub Verify before merge.

