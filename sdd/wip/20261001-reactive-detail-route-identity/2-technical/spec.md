# Technical spec — reactive detail route identity

Containers subscribe to ActivatedRoute.paramMap, select the identifier, suppress
duplicate identities, and use takeUntilDestroyed. Retry reads the current
snapshot. Existing ComponentStore GET effects clear the entity and switchMap
superseded reads.

UserOrderDetailStore owns currentOrderId and a monotonically increasing load
generation. Each fulfillment mutation captures that generation; its success or
error never applies an obsolete response object directly. If an obsolete
mutation finishes while its order identity is visible again, the store starts
an authoritative GET and keeps that order occupied until the refresh settles;
an obsolete failure may publish its error only in that same visible identity.
Filtering
commands checks route identity, loaded order identity, GET loading state and
independent mutation occupancy for that order. Active mutation identities
survive navigation and GET completion. A returned-to identity transfers its
busy state from mutation occupancy to the authoritative refresh before
`finalize` removes the completed mutation identity.
Different-order requests use mergeMap so starting B cannot cancel A and falsely
release its occupancy. The public loading observable also represents mutation
occupancy for the currently displayed order. This does not undo or replay a
dispatched backend write.

The view clears its tracking draft when the input order identity changes and
disables mutation buttons during loading.

Identifiers are open values, not new finite domain states. OrderStatus,
PaymentStatus, ShipmentStatus, RmaStatus and closed transition instances remain
unchanged. HTTP serialization remains in existing repositories.

No changes to API routes, payloads, ownership, CSRF, capability evaluation,
database or backend. Catalog query navigation was already reactive at baseline.
