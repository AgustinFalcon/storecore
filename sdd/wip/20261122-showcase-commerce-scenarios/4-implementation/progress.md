# Progreso

- 2026-11-22: spec funcional/técnico y matriz de nueve escenarios definidos sobre el dataset V3 ya fusionado.
- 2026-11-22: el corte depende del soporte de overview para retiro de PR #351; se desarrolla apilado y no se fusionará antes de ese prerrequisito.
- 2026-11-22: se preserva la cadena checkout real → proveedor oficial local → webhook firmado → worker real → aplicación comercial; quedan prohibidos inserts directos de autoridad.
- 2026-11-22: proveedor local con journal JSON atómico, estados cerrados, hash canónico por idempotency key, rechazo de payload divergente y restauración después de reinicio. Test de proceso real: 1/1.
