# Spec UI — admin (TASK-009 / TASK-010)

## Promos `/user/promos`

- Alta manual: listing/SKU, currency, vigencia, prioridad, margen, aprobador y `approvedAt`.
- Writer = MANUAL. No hay toggle de automatización ML.
- `GET/POST /api/v1/user/promos`. El API rechaza solapamiento ACTIVE.

## Fulfillment `/user/orders`

- Transiciones: PENDING → PACKED → SHIPPED → DELIVERED. La UI sólo ofrece la siguiente.
- Tracking informativo en el POST de shipment. Sin carrier real.
- RMA: received → inspected → adjusted. Restock bloqueado hasta adjusted.
- `GET /api/v1/user/orders`, `POST .../shipments`, `POST .../rma`.
