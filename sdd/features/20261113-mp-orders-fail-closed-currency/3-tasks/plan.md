# Plan — moneda oficial fail-closed

| ID | Trabajo | Estado | Evidencia / gate |
| --- | --- | --- | --- |
| MPC-001 | Documentar defecto, alcance y necesidad de un gate fresco. | Done | Specs + closeout NO-GO de 2026-09-23. |
| MPC-002 | Emitir nuevo gate y revisar specs con pagos/dominio y seguridad. | Done | Dos `CONDITIONAL_GO` GPT-6.1 Sol, sin P0–P3; review `20261113-sol-mp-currency-offline-go.md`. |
| MPC-003 | Implementar tipo cerrado y mapper único de wire. | Done | `PaymentCurrency` + `OfficialOrderWireMapper`. |
| MPC-004 | Integrar el tipo en recovery y aplicación comercial. | Done | Matriz fail-closed antes de efectos; evidencia usa moneda validada. |
| MPC-005 | Añadir pruebas de traductor, política y no efectos. | Done | JSON inválido, matriz completa, cuarentena y stock/pago intactos. |
| MPC-006 | Ejecutar suite backend y doble revisión del código. | Done | 405 tests + regresión 28; dos `APPROVED` sin P0–P3. |
| MPC-007 | Ejecutar CI del PR, fusionar y verificar `master`. | Done | PR #258: `43460940429`; merge `43489ef`; post-merge `43462225801`, 3/3 verde. |

Ninguna tarea de este plan autoriza red real, credenciales, homologación,
producción, MP-LIVE-05 o integración fiscal.
