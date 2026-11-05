# SC-SURF-25 R7 — addendum de implementación

Estado: listo para rerevisión de especificación. Complementa `sc25-r6.1-brief.md`;
no reemplaza el contrato Real ni habilita backend, publicación o integración externa.

## Decisión de dominio y propiedad

SC25 suma en Demo dos agregados independientes:

1. `storeProfile`: exactamente `storeName`, `supportEmail`, `supportPhone`,
   `currency` y `timezone`.
2. `profileSections`: colección local con la forma Real `sectionKey`, `content`,
   `active`, `sortOrder`.

La migración única v9→v10 es aditiva: baseline exacto de R6.1 y
`profileSections=[]`. Un v10 incompleto o malformado falla cerrado. No se leen,
escriben ni reinterpretan `title`, `subtitle`, `blocks`, `contentDraft` de SC16,
preferencias/switches de SC24, capabilities, pedidos o clientes.

## Configuración Demo

- Ruta `/demo/user/profile-import`, ADMIN-only; se autoriza antes de exponer datos.
- Nombre, email y teléfono editables; contactos vacíos válidos y formato validado si
  existen. Moneda ARS y zona `America/Argentina/Buenos_Aires` son fijas.
- Guardar, exportar y resetear afectan exclusivamente `storeProfile`.
- Export: documento JSON de exactamente las cinco claves y valores persistidos, sin
  wrapper, fechas, credenciales, sesiones, identidad legal ni otros agregados. Es
  export parcial, no backup ni manifiesto Real.
- Reset exige review before/after y confirmación; deja `Mi tienda`, contactos vacíos,
  ARS y Buenos Aires. Cancelar y doble click son no-op.

## Importación Demo

- El ejemplo sólo llena el editor; no importa, publica ni puebla la portada.
- Esquema permitido exacto: `universal-tools-profile`, `1.0.0`, compatibilidad `1.x`,
  máximo 100 `homeSections`, claves únicas/tipadas y 20.000 bytes UTF-8 por `content`.
- Demo comprueba localmente metadatos, compatibilidad y selección; no delega esas
  decisiones al parser Real.
- Preview puro calcula diff semántico `ADD`, `UPDATE`, `UNCHANGED` o `Unknown` contra
  `profileSections`. Primera preview vacía demuestra ADD; UPDATE/UNCHANGED requieren
  una importación previa o fixture aislado explícito.
- Selección existente, única y no vacía. Cualquier edición o cambio de selección
  invalida preview/texto exacto y exige repreview y confirmación.
- Merge confirmado agrega/actualiza sólo claves seleccionadas, conserva el resto y
  nunca hace DELETE/REPLACE/publicación ni HTTP.
- Incompatible, malformado, sensible, selección vacía/ajena/duplicada o Unknown
  bloquea aplicación completa. Entrada rechazada nunca se persiste ni registra.

## Autoridad, consistencia y recuperación

- Admin, actor, epoch y `sessionGeneration` se revalidan al leer y dentro de cada
  escritura. Writer/snapshot usan CAS y readback; una sola escritura activa.
- Save/reset/merge son comandos acotados, atómicos e idempotentes. CAS inter-tab,
  quota o readback distinguen fallo conocido de resultado incierto.
- Ante conflicto o incertidumbre se conserva la propuesta sólo en RAM y sólo mientras
  continúe la misma autoridad; se relee snapshot y se exige preview + confirmación
  nuevos. Nunca hay retry/replay automático del merge.
- El CTA legado que mutaba sólo `title` se sustituye por el flujo SC25 sin conservar
  compatibilidad falsa.

## Real inmutable

`/user/profile-import` conserva el corte 2026-10-27: editor, preview HTTP, selección,
repreview, confirmación y merge servidor. No muestra settings/export/reset, no usa el
ledger local y no reintenta merge incierto. Endpoints, envelopes y efectos no cambian.

## Tipos y pasos

Estados, compatibilidad, operaciones de diff y pasos son tipos cerrados con `Unknown`
y un único traductor de borde. Cada paso es un objeto de responsabilidad única. La
vista, el store y los tests usan esos tipos; no comparan strings mágicos.

## Gates de aceptación

1. Unitarios: tipos/traductores, schema/límites, diff/selección, roundtrip, migración,
   corruptos, aislamiento SC16/24 y exactitud del export/reset.
2. Persistencia: CAS inter-tab, quota, readback, conflicto normal y posterior a
   preview, doble dispatch, cambio de actor/sesión y recuperación sin reapply.
3. Browser ADMIN a 320/390/768/1440 y text zoom 200%: guardar/reload, export exacto,
   reset cancel/confirm, ejemplo, preview, selección, repreview, confirmación,
   merge/reload; cuatro diálogos R6.1, foco post-render, teclado y axe.
4. Negativos: OPERATOR/Unknown, incompatible, malformado, sensible, selección vacía,
   stale, Unknown y fallo/incertidumbre.
5. Verify completa y builds Demo/Real. Real no emite nuevas escrituras; CTA y SC16/24
   conservan semántica.
6. Revisión técnica y UX GPT-6.1 Astra: cero P0-P3 antes de aprobar el corte.
