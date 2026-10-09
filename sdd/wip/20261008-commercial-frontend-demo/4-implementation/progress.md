# Evidencia y pendientes

Documento de planificación, 2026-10-08. Base inspeccionada `ef21e612d13a2b104dd7c96fb1f97ae4e7ca8ce2`: app.routes.ts tiene 24 rutas hoja y app.config.ts enlaza ocho repositorios HTTP. Este commit no contiene implementación, resultado de tests de producto, review aprobada ni capturas.

Inventario inicial define grupos de acciones exigidos por ruta; falta reconciliación de CTA concretos con implementación final y DOM. Todos E01–E10: NOT_RUN. DEMO-B/T/U1/U2/E: pendientes. No cierre de SDD, master, release, integración real ni homologación.

Por cada entrega agregar SHA/base, rutas/CTA cubiertos/total, comandos/resultados, screenshots desktop/mobile, hallazgos y correcciones, review funcional/diseño, review código/seguridad y residuales reales. No convertir acciones simuladas en evidencia backend.

## Primer corte comercial implementado — 2026-10-08

Base documental aprobada `0a57e0cc`; branch `feat/commercial-demo-frontend`; worktree `work/storecore-commercial-demo-implementation`. Entrada compilada separada `main.demo.ts`, rutas `/demo`, snapshot local versionado compartido. El build productivo y el HTTP/auth original siguen en su entrada anterior.

Se implementaron las 24 superficies: home/catálogo/PDP/carrito/checkout/resultados, login/registro/perfil/direcciones/favoritos/pedidos, dashboard/contenido/catálogo/ofertas/promos/pedidos/inventario/ML/módulos/configuración. Compra afecta stock, pedido y timeline; el fulfillment es visible al comprador. Oferta modifica vitrina y carrito. Venta ML es deduplicada por operation id; sync, cuenta y alertas de precios están marcados como simulados. Cancelación de formularios no guarda; operaciones destructivas/fulfillment/import usan confirmación modal. Dinero usa unidades menores; identidad y almacenamiento demo usan namespaces separados.

### Evidencia ejecutada

- `npm run test`: PASS 298/298, 73 archivos (13 nuevas pruebas de dominio/snapshot/transacciones), Vitest 4.1.11; 2026-10-08 23:14 ART.
- `npm run lint -- --quiet`: PASS. `npm run check:architecture`: PASS (6 verificadores y escaneo).
- `npm run build -- --configuration production --preserve-symlinks`: PASS, 552.34 kB; 23:17 ART. El primer intento falló por red restringida al descargar Google Fonts; se repitió con permiso de red, sin cambiar fuentes/configuración de producción.
- `npm run test:demo`: PASS con exit 0, 8/8, Chromium, 15.0 s; 23:20 ART. Incluye build demo PASS 1.87 MB; servidor de archivos local se detiene en `finally`.
- Playwright: compra/stock/pedido/despacho/entrega; 24 rutas; contenido/vitrina; ML deduplicado/ajuste; oferta/vitrina/carrito; Escape/foco; reset; buyer observa fulfillment; alerta/historial competidor. Requests de API/externos bloqueados.
- Desktop/mobile: 1440×900, 768×1024, 390×844: PASS sin scroll global; axe 0 violaciones en storefront para los tres tamaños. Se corrigieron contraste de secundarios y landmark del banner. Screenshots storefront/dashboard en `frontend/test-results/commercial-demo-responsive-design-{width}/`. Revisión visual propia realizada; review de diseño independiente: pendiente.
- `runtime-route-cta-inventory.json` es el inventario DOM de rutas y CTA visibles en estado inicial autenticado. Los diálogos/escenarios posteriores se cubren en pruebas específicas; aún falta reconciliación exhaustiva de todos los estados/CTA a assertions individuales.

### Límites y pendientes de cierre

Este corte NO declara 100% de CTA accionados ni E01–E10 cerrados. E10 (reviews independientes) pendiente. La galería de PDP usa ilustración local única; variantes son una configuración por producto. Quedan refinamientos de galerías/variantes múltiples, composición/reordenamiento de bloques y configuración avanzada de módulos del inventario original. Se conservan como pendientes explícitos para iteración, sin botones vacíos que aparenten ejecutarlos.

HTTP Mock/UA E09 específico: NOT_RUN en este corte; sí full unit y build productivo. Backend FE04, proveedores reales, scraping/ML live, cobros, correo y fiscal: NOT_RUN/fuera de demo. No push, PR, merge ni deploy. No se declara homologación.
