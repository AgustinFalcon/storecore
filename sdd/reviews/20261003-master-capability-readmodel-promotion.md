# Promoción a master — read-model de capabilities tipado

**Estado:** implementado, pendiente de Verify y reviews obligatorias  
**Base:** `homologation/master-capability-module` / PR #153  
**Procedencia:** issue #133 / commit fuente `40ffb6e3aaba9181791c0a6097608c2fd3de3b34`

## Alcance

- `CapabilityModuleView` transporta `InstallationCapabilityModule`, no `String`.
- El borde JDBC traduce módulo y estado mediante un único `fromWire` por tipo.
- Los wires desconocidos colapsan a `Unknown` y nunca conservan/imprimen el texto crudo.
- El payload de consola oculta `BLACKSTORE_INTEGRATION` y módulos desconocidos, y serializa wires canónicos.
- Las mutaciones de consola rechazan el companion, módulos desconocidos y estados desconocidos antes de persistir.
- Remove/replace vinculan el `killId` con el módulo tipado dentro de overloads `SECURITY DEFINER`; el runtime conserva sólo `SELECT` y `EXECUTE`, y un ID de otro módulo falla sin mutar.
- Los overloads fijan `search_path=pg_catalog,public,pg_temp`; tablas temporales adversarias no pueden sombrear identidad/roles.
- El estado `Unknown` falla cerrado en decisiones y administración.

## Exclusiones

No incorpora `CapabilityAdminCommandService`, Tx-S/Tx-C, POSC, DSP, frontend ni activación operativa de BlackStore. La migración V8 sólo agrega overloads de administración que preservan el modelo de privilegios. Mantiene el mismo contrato JSON para valores conocidos y no cambia fiscal/ARCA, Correo Argentino ni live.

## Gates

- [x] Tests focalizados del tipo/read-model/controller boundary: 6/6 PASS local.
- [ ] Regresión Testcontainers bajo `SET ROLE storecore_runtime`: cubre remove/replace, mismatch y temp-table shadowing de identidad/roles; compila local, pero su ejecución local está bloqueada porque el sandbox no accede al named pipe de Docker. Debe pasar en Verify hospedado.
- [ ] Verify hospedado sobre el SHA final.
- [ ] Reviews GPT-6.1 Sol de código, SDD y seguridad.
- [ ] Dos reviews Grok 4.7 genuinas.

El corte permanece apilado y draft hasta integrar su base y cerrar todos los gates.
