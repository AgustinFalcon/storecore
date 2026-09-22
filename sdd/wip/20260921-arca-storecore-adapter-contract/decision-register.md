# Registro de decisiones fiscal StoreCore

Ninguna fila cerrada por este documento supone un emisor, servicio, trigger o credencial. La evidencia se conserva saneada y fechada.

| ID | Decisión/evidencia exigida | Dueño | Fuente/fecha/aprobador esperado | Estado |
| --- | --- | --- | --- |
| D-01 | Límite biblioteca externa/adaptador y ownership de datos. | Plataforma | ADR/SDD fechado + Sol | Open |
| D-02 | Emisor(es), PV, vigencia y referencias de credencial. | Titular + contador | Evidencia saneada + contador | Open |
| D-03 | Matriz receptor–comprobante–IVA, importes, detalle/no detalle y parciales/saldo/sobrepago. | Contador | Matriz fechada + contador | Open |
| D-04 | Servicio ARCA, manual/WSDL/version/checksum y capacidad CAE/CAEA. | Plataforma + contador | Fuente ARCA fechada + contador | Open |
| D-05 | Trigger, fecha fiscal, entrega y cambios posteriores. | Producto + contador | Política fechada + contador | Open |
| D-06 | NC/ND, refund, chargeback, asociaciones y retención. | Producto + contador | Política fechada + contador | Open |
| D-07 | Recurso MP canónico, validación/refetch, transición desde preferencias y correlaciones. | Plataforma | Contrato MP fechado + plataforma | Open |
| SC-01 | Política `FiscalEligibility` y su versión. | Producto | SDD/ADR fechado + producto | Open |
| SC-02 | Fórmulas de claves y dedupe. | Plataforma | Modelo revisado + plataforma | Open |
| SC-03 | Exclusión durable, fencing y recuperación por emisor/PV/tipo. | Plataforma | Diseño/test plan + plataforma | Open |
| SC-04 | Modelo físico, snapshot protegido, retención/acceso/exportación. | Plataforma + legal | Modelo/retención fechados + legal | Open |
| SC-05 | Rectificativos y relación con original. | Producto + contador | Política fechada + contador | Open |
| SC-06 | PDF/HTML/QR, entrega, accesibilidad y reintentos. | Producto + compliance | Requisito fechado + compliance | Open |
| SC-07 | Ownership/provenance de inbox-outbox y atomicidad con pagos. | Plataforma | ADR/modelo fechado + plataforma | Open |
