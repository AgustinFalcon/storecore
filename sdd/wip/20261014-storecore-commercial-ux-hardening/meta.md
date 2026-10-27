# StoreCore — hardening UX comercial para entrega

Estado: SPECS_APPROVED. Fecha: 2026-10-14. Base: `1d510e9a47050325450618b84e40f8dd6e38aca1`.

spec_language: es
platform: frontend-web
project_type: production
template_mode: full
execution_strategy: batched
tasks_status: approved
tasks_approved_by: Agustin Falcon
tasks_approved_at: 2026-10-14
functional_status: approved
technical_status: approved
approved_by: Agustin Falcon
approved_at: 2026-10-14T23:20:22.8873855Z

## Objetivo

Cerrar los gaps P2 encontrados por revisiones independientes UX, UI y Product
Owner sobre el frontend demo completo, comparado con patrones actuales observados
en Compra Gamer y Mercado Libre. La referencia externa guía jerarquía, confianza
y continuidad; no se copian marcas, diseño, promociones ni claims.

## Límites

Este corte conserva datos y operaciones simuladas. No declara proveedores reales,
Mercado Pago, ARCA, Mercado Libre, Correo Argentino ni homologación. Los textos no
inventan reputación, cuotas, cobertura, domicilio comercial, CUIT o garantías.

## Fuentes

- Revisiones GPT-6.1 Sol: UX, UI visual y Product Owner, esfuerzo medio.
- Capturas StoreCore 390/768/1440 bajo `frontend/test-results/`.
- Inspección browser 2026-10-14 de Compra Gamer y Mercado Libre.
- Stitch `projects/6473866243657965808`, design system StoreCore
  `assets/9094855779690782792`.

## Iteración 2026-10-14 — auditoría estricta

La declaración anterior de completitud queda superada. Auditoría posterior:

- demo: 25 superficies declaradas, 24/25 coberturas ejecutadas;
- evidencia: 60 capturas de 20 superficies, insuficiente;
- objetivo: 26 superficies, incluyendo Administración de clientes;
- P1: editor permite persistir estados que el decoder rechaza al recargar;
- P2: coherencia pago/fulfillment, cronología, alertas, dashboard, comprador e inventario;
- demo y rutas productivas se validan por separado.

Spec review: UI APPROVE; UX APPROVE; PRODUCT_OWNER APPROVE.

Senior development review: two independent Angular/TypeScript reviewers requested
contract hardening before task generation. Amendments now define all 26 targets in
`1-functional/delivery-manifest.json`, prohibit productive fixture adapters, require
SOLID extraction, transactional persistence, strict inventory balances and WCAG 2.2
reflow/target-size evidence. Final re-review: SENIOR_ARCHITECT APPROVE and
SENIOR_DELIVERY APPROVE; no contractual P1/P2 remains.

Task-plan review: both senior reviewers requested two P2 corrections (canonical
E2E ownership and immutable final-SHA reviews). Both corrections are incorporated.
Final verdict: SENIOR_ARCHITECT APPROVE and SENIOR_DELIVERY APPROVE; 24 tasks,
no orphan/cycle, exactly three Layer 3 quality reviews.

Gates: SDD PLAN_APPROVED; DESIGN IN_PROGRESS; IMPLEMENTATION PROVISIONAL_AUTHORIZED;
EVIDENCE INCOMPLETE; FINAL_REVIEW NOT_RUN; CI PENDING.

## Excepción controlada 2026-10-15 — capacidad Stitch

Stitch rechazó la regeneración de SC-SURF-20A con `Resource has been exhausted`
y no ofrece un ETA verificable. Agustin Falcon autorizó continuar con los diseños
y briefs actuales y retomar Stitch cuando vuelva a estar disponible.

La autorización permite TASK-005..018 bajo estado `PROVISIONAL`: dominio, tests,
arquitectura, comportamiento, responsive y composición basada en los artefactos
actuales. No convierte la aprobación documental en aprobación visual. TASK-004 se
mantiene abierto y pasa a ser dependencia obligatoria de TASK-019 y de cualquier
declaración de frontend final, entrega visual o cierre del feature.

Cuando Stitch recupere capacidad se generan artefactos inmutables nuevos para
SC20, SC21B y SC22..26, se ejecutan los gates UI/UX/Product Owner coordinados y se
aplican las diferencias antes de TASK-019. No se falsean IDs, capturas ni veredictos.
