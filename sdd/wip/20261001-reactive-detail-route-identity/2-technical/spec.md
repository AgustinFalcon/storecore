# Technical spec — reactive detail route identity

Containers subscribe to ActivatedRoute.paramMap, select the identifier, suppress
duplicate identities, and use takeUntilDestroyed. Retry reads the current
snapshot. Existing ComponentStore GET effects clear the entity and switchMap
superseded reads.

UserOrderDetailStore owns currentOrderId and a monotonically increasing load
generation. Each fulfillment mutation captures that generation; its success or
error updates presentation state only while it remains current. Filtering
commands checks route identity, loaded order identity, GET loading state and
independent mutation occupancy for that order. Active mutation identities
survive navigation and GET completion; finalize removes them on completion,
error or subscription teardown even when the response generation is obsolete.
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
