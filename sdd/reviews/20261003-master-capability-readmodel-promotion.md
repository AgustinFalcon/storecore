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
- El estado `Unknown` falla cerrado en decisiones y administración.

## Exclusiones

No incorpora `CapabilityAdminCommandService`, Tx-S/Tx-C, POSC, DSP, migraciones, frontend ni activación operativa de BlackStore. Mantiene el mismo contrato JSON para valores conocidos y no cambia fiscal/ARCA, Correo Argentino ni live.

## Gates

- [x] Tests focalizados del tipo/read-model/controller boundary: 6/6 PASS local.
- [ ] Verify hospedado sobre el SHA final.
- [ ] Reviews GPT-6.1 Sol de código, SDD y seguridad.
- [ ] Dos reviews Grok 4.7 genuinas.

El corte permanece apilado y draft hasta integrar su base y cerrar todos los gates.
