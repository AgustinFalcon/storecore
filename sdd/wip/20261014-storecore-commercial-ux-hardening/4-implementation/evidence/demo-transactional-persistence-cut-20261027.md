# Corte de persistencia transaccional del demo — 2026-10-27

## Alcance

Este corte apilado sobre `837d437b30a61e2e901453d9116a62725a0be531` endurece exclusivamente el frontend demo de StoreCore:

- una única frontera de serialización y persistencia para el snapshot comercial;
- validación canónica antes de publicar estado en memoria;
- comparación de contenido y revisión para rechazar escrituras obsoletas;
- verificación de lectura posterior y rollback ante fallos de almacenamiento;
- un único escritor por origen mediante Web Locks;
- modo de solo lectura explícito en pestañas secundarias y transferencia de propiedad al cerrar la pestaña escritora.

No incorpora contratos HTTP, cambios de backend, migraciones de datos ni integraciones externas.

## Invariantes verificadas

1. La UI nunca publica un snapshot que no haya sido validado y persistido completamente.
2. Una mutación sin ownership no ejecuta su callback.
3. Una escritura concurrente con la misma revisión pero distinto contenido se rechaza.
4. Un fallo de cuota o una lectura posterior inconsistente conserva el último snapshot válido.
5. Los estados del escritor son un tipo cerrado con traducción única desde wire y caso `Unknown`.
6. Cerrar la pestaña escritora permite que una pestaña secundaria adquiera la escritura al recargar.

## Evidencia local

- `npm run verify`: PASS — arquitectura 6/6, lint, build de producción y 253 tests unitarios.
- `npm run test:demo`: PASS — 27/27 escenarios Playwright.
- Cobertura específica: snapshot inválido, corrupción, cuota, reemplazo obsoleto, deduplicación de escritor y transferencia de ownership entre dos páginas del mismo origen.

## Limitaciones deliberadas

- La coordinación usa Web Locks y se degrada a estado no escribible cuando el navegador no lo soporta.
- Este corte no compone todavía el editor visual de variantes; crea la base transaccional necesaria para que ese siguiente corte no pierda ni pise cambios.
- Las revisiones de producto y técnica deben aprobar el SHA final antes de publicar el PR.
