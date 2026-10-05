# Functional acceptance — issue #143

The ML console renders only recognized account-state labels owned by its domain type. Unrecognized/malformed/missing states display Estado no reconocido and cannot show an authorized badge, including when the payload claims authorized=true. Active and disabled account responses preserve their existing authorized/reference semantics.

Adding a recognized account state requires a closed-type case and translator tests; the view/store do not compare text or render an unknown raw value. Roles and ML live behavior are outside this feature.
