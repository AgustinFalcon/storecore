# SC-SURF-24 R7 — addendum implementable de módulos del comercio

Estado: candidato a aprobación. Fecha: 2026-11-04. Base: `98e9552`.

## Fuente de verdad y límites

SC24 agrega un ledger comercial propio; no deriva ni escribe los cuatro switches ni las
cinco preferencias técnicas existentes. Siete definiciones usan los tipos cerrados ya
existentes para estado operativo, disponibilidad y nivel de entrega.

Baseline aditivo único: Catálogo `Active` versión 7; Mercado Libre `Unknown` versión
nula; Inventario, Outlet, ARCA, Envíos avanzados y Billeteras `No aplica`. Disponibles:
Catálogo, Inventario, ML y Outlet; ARCA/Billeteras diferidos; Envíos bloqueado por
dependencia. Entrega: Catálogo/Inventario Integrated, ML IntegrationReady, Outlet y
ARCA/Billeteras DesignApproved, Envíos DemoApproved. Ningún nivel acredita
homologación.

Owners: Catálogo/Outlet `/demo/user/catalog`, Inventario `/demo/user/inventory`, ML
`/demo/user/mercadolibre`. Tres futuros sólo información, sin rutas inventadas. Real
permanece GET-only.

## Ruta y autoridad

`/demo/user/capabilities` usa tab cerrada `modules|technical`, preservada en URL/back/
reload. Modules es default para Admin/Operator. Technical es Admin-only y conserva
cuatro switches, cinco preferencias, owners y handlers heredados. Operator deep-link
no monta datos/controles técnicos y retorna a Modules. Dashboard permite a Operator
navegar a Modules.

Los callbacks técnicos revalidan Admin, actor y epoch dentro de la escritura. Cambiar
SC24 no modifica flags/preferencias; cambiar flags/preferencias no modifica ledger SC24.

## Comando Demo soportado

Sólo Admin cambia CATALOG `Active ↔ Paused`. Es un registro local y no deshabilita
rutas/productos. Propuesta: motivo obligatorio, actor/epoch, estado actual/propuesto,
expectedConfigVersion y commandId/payload canónico. Recibo, evento y versión persisten
atómicamente mediante writer/CAS/readback.

Mismo ID/payload devuelve resultado previo; ID con payload distinto es Conflict.
Conflicto o resultado incierto conserva propuesta. Recuperación consulta el mismo UUID
y luego lista fresca; igualdad de estado no acredita comando. Lectura fallida queda
Uncertain. Cambiar contexto/payload tras review exige nueva identidad y confirmación.
Estados cerrados: Editing, Reviewing, Saving, Confirmed, AlreadyApplied, Conflict,
Uncertain, Failed, Unauthorized, Unknown.

## Experiencia y gates

Siete fichas con búsqueda y tres filtros correlacionados; resumen global separado de
`X de Y`. `No aplica` y Unknown son distintos. Diálogos: información, confirmación e
incertidumbre; foco/trap/Escape/restauración y borrador preservado. Tabla/grid 1440,
tarjetas 768, columna 390/320, texto 200 % y axe.

Gates: migración/codec viejo+nuevo/Unknown; autoridad y pérdida de actor; version
conflict, snapshot CAS, quota/readback, doble submit/reload; aislamiento ledger↔técnico;
owners/URL/back; regresiones SC11/17/22/23/CTA/Real GET-only; verify/builds/browser en
cuatro anchos. Cierre requiere doble Astra sobre fingerprint exacto.
