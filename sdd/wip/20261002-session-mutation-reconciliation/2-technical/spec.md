# Design

`QueuedMutation` owns one request's observer delivery and failure isolation. `SessionMutationQueue` orders tasks with concatMap. Separate root `UserMutationQueue` and `CustomerMutationQueue` instances compose that transport for the independent backend identity realms and outlive component stores. No additional status strings or domain states are introduced; ShipmentTransition/RmaTransition remain closed domain instances, and the domain imports no Angular or HTTP.

The auth interceptor supplies a deferred request factory, so token selection happens after prior response handling. Both protected mutations and CSRF GET probes participate. A raw HttpBackend recovery probe stays inside the failed task, avoiding recursive queue deadlock. The error is emitted after recovery; no automatic POST retry exists. Queued cancellation prevents dispatch, while cancellation after dispatch only disconnects the observer.

The fulfillment store keeps its route-generation isolation. On termination of an older generation's mutation, if the current identity matches, finishMutation invokes load before removing the mutation marker. load clears the pre-commit snapshot and cancels any older GET; loading blocks actions until a new result. Failure leaves order null. Destruction prevents a reconciliation request.

Boundary: serialization covers the current Angular application's sessions, not multiple tabs or clients. Cross-client synchronization and retry policy are outside this corrective scope.
