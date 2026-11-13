# Plan — autoridad cerrada de moneda

| ID | Trabajo | Estado | Evidencia / gate |
| --- | --- | --- | --- |
| CCA-001 | Documentar autoridad, UX y límites ARS-only. | Done | Specs de este WIP. |
| CCA-002 | Revisar specs con dominio/UX y seguridad. | Done | Dos GO GPT-6.1 Sol sin P0–P3; review `20261113-sol-cart-currency-go.md`. |
| CCA-003 | Tipar backend y leer autoridad de instalación. | Done | `PaymentCurrency` desde controller hasta persistencia; instalación ausente/inválida produce `UNKNOWN`. |
| CCA-004 | Tipar mapper, dominio, store, repository y vista Angular. | Done | `CartCurrency`, sin strings/fallback/input editable; serialización sólo mediante `.wire`. |
| CCA-005 | Agregar pruebas backend/frontend y UX fail-closed. | Done | Matrices ARS/Unknown, replay inválido, revocación concurrente y serialización cubiertas. |
| CCA-006 | Ejecutar suites y doble revisión del código. | Done | Backend 407/407; frontend 1229/1229; dos GO GPT-6.1 Sol sin P0–P3. |
| CCA-007 | Ejecutar CI, fusionar y verificar `master`. | Done | PR #259 fusionado como `653b5eb`; tres jobs verdes en PR y post-merge. |

Este plan no autoriza multimoneda, DDL, credenciales, activación de proveedores,
homologación, fiscal ni producción.
