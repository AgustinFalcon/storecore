# SC-SURF-25 — configuración e importación Demo

Base `74dbf990948dc54ac3ef9255b36be84dc1174b65`, fecha 2026-11-05.
Implementación local aprobada; sin push, PR, merge, backend ni deploy.

## Alcance implementado

- Ruta `/demo/user/profile-import`, exclusiva de ADMIN.
- Cinco datos generales independientes: nombre, email y teléfono de soporte, ARS y
  `America/Argentina/Buenos_Aires`.
- Guardado, export parcial exacto y reset con revisión before/after.
- Importador Demo compatible con el schema Real de `content.homeSections`, con
  ejemplo, preview semántico, selección, repreview, confirmación y merge local.
- Snapshot v10 aditivo y fail-closed; SC16, SC24 y el flujo Real 2026-10-27 quedan
  independientes.
- CAS/readback, writer único, rebase por campo, revocación de actor, recuperación sin
  replay, caducidad de diálogos y reautorización al descargar.
- Tipos cerrados para estados, resultados, operaciones, moneda y zona; `Unknown` en
  fronteras. Rechazo de secretos, números no finitos o inseguros y selección inválida.

## Gates ejecutados

- `npm run verify`: PASS; arquitectura 7/7, lint PASS, **116 archivos / 897 tests**,
  build Real PASS.
- `npm run build:demo`: PASS.
- Playwright focal SC25: **38/38 PASS**.
- Playwright combinado SC16 + SC24 + CTA global + SC25: **87/87 PASS**. Incluye CTA
  global 25/25, reflow 320/390/768/1440, texto 200 %, axe, teclado, foco y capturas.
- Regresiones verificadas: concurrencia entre pestañas, writer read-only, cuota,
  readback incierto, revocación, export autorizado, stale preview/dialog, unsafe
  integer, no-op merge, preservación de drafts y foco estable en terminales.
- Revisión técnica GPT-6.1 Astra: `APPROVE — 0 P0-P3`.
- Revisión UX/producto GPT-6.1 Astra: `APPROVE — 0 P0-P3`.

Fingerprint del diff frontend staged revisado:
`a97fa9803e69e8be92a7344e69d92b2a05ba4d20`.

Evidencia browser: `frontend/demo-playwright-report/results.json`. Capturas locales
ignoradas por Git bajo `frontend/test-results/profile-settings-sc25-*`.

## Límites honestos

El import Demo sólo modifica su colección local y no publica portada, no realiza HTTP
ni homologa integraciones. Real conserva sus endpoints y autoridad servidor. CI remoto,
backend vivo y deploy no se ejecutaron en este corte.
