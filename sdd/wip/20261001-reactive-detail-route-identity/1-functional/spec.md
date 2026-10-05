# Functional spec — reactive detail route identity

Problem: Angular reuses the detail container when its route identifier changes.
The four containers loaded only on initialization, leaving the old product or
order visible under the new URL. Fulfillment actions could therefore target the
old order.

- AC-RDI-1: product, customer order, checkout result and internal order detail
  load the path identity on entry and every identity change in a reused route.
- AC-RDI-2: query-only changes do not reload details; explicit retry refetches
  the current path identity. Checkout return query parameters never establish
  payment status.
- AC-RDI-3: navigation clears old details while loading. Superseded GETs cannot
  repaint the current route; a failed new request never restores old data.
- AC-RDI-4: completion or failure of an earlier fulfillment mutation cannot
  overwrite the current route, including a return to the same order identifier.
  Commands require the loaded current order, no GET in progress and no mutation
  for that order in progress, including after returning A to B to A and finishing
  the new A GET before the old A POST.
- AC-RDI-5: changing the order identity clears the tracking draft. Fulfillment
  buttons are disabled while loading.
- AC-RDI-6: route subscriptions end with the component lifetime.

Existing separate CUSTOMER/USER authorization and closed status/transition
types remain the owners of their behavior and labels.
