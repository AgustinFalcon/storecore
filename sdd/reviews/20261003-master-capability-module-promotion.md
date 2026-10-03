# Promoción a master — módulo de capability cerrado

**Estado:** implementado, pendiente de Verify y reviews obligatorias  
**Base:** `homologation/master-core-hardening` (`1dd5149`)  
**Procedencia:** issue #131 / commit fuente `909b8ce84ed3fffa0675d3c55a8889a000a2f9ac`

## Alcance

- Modelar los dieciséis módulos web, `BLACKSTORE_INTEGRATION` y `Unknown` como casos cerrados de Kotlin.
- Mantener un solo traductor `fromWire`, exacto y sensible a mayúsculas.
- Conservar `BLACKSTORE_INTEGRATION` y todo wire desconocido ocultos de la consola.
- Probar identidad, wire, visibilidad y entradas inválidas.

## Exclusiones

Este corte no cambia controller, persistencia, SQL/Flyway, permisos, frontend ni activación de capabilities. No activa StoreCore↔BlackStore, no incorpora POSC/DSP, no toca fiscal/ARCA ni Correo Argentino y no reutiliza como evidencia las aprobaciones del branch de integración.

## Gates

- [x] Test focalizado: `InstallationCapabilityModuleTest` (2/2, local).
- [ ] Suite backend proporcional.
- [ ] Verify hospedado sobre el SHA final.
- [ ] Review funcional/SDD del nuevo diff.
- [ ] Review de seguridad del nuevo diff.
- [ ] Dos reviews Grok 4.7 genuinas exigidas por el repositorio.

Hasta cerrar todos los gates, el corte permanece apilado sobre #152 y no es mergeable por proceso aunque GitHub indique que no hay conflictos.
