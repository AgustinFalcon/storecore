# Registro de decisiones — Correo Argentino

Ninguna fila se cierra por inferencia. La evidencia debe estar fechada, saneada
y aprobada por su dueño; secretos y PII sólo se referencian de forma opaca.

| ID | Decisión/evidencia exigida | Dueño | Evidencia esperada | Estado |
| --- | --- | --- | --- | --- |
| CA-D01 | Producto y API canónica: MiCorreo, PAQ.AR API 2.0 u otra versión entregada por Correo. | Titular + Correo + plataforma | Acuerdo/manual/version fechados | Open |
| CA-D02 | Ambientes, hosts y auth; credencial QA por referencia antes de implementar. PROD se exige sólo para CA-T08. | Correo + plataforma | Alta comercial, contrato y plan de prueba `/auth`/`/token` | Open |
| CA-D03 | Agreement/customer/seller, servicios y modalidades habilitados. | Titular + Correo | Ficha comercial saneada | Open |
| CA-D04 | Origen/es, pickup/admisión y sucursales disponibles. | Operaciones + Correo | Configuración QA y contrato | Open |
| CA-D05 | Cotización, moneda, impuestos, vigencia y snapshot cobrado. | Producto + comercial | Casos QA y política firmada | Open |
| CA-D06 | Peso, medidas, valor declarado, contenido prohibido, validación de destino y soporte de uno/múltiples bultos. | Operaciones + Correo | Reglas del servicio elegido | Open |
| CA-D07 | Alta/importación, referencia única, cancelación, rescate y devolución. | Operaciones + plataforma | Contrato y casos QA | Open |
| CA-D08 | Rótulo/formato, admisión y evidencia de aceptación física. | Operaciones + Correo | Manual vigente y prueba QA | Open |
| CA-D09 | Tracking, catálogo de eventos, polling/webhook y SLA/rate limits. | Correo + plataforma | Catálogo/contrato fechado | Open |
| CA-D10 | Facturación, reclamos, soporte, retención y responsabilidades. | Titular + legal + operaciones | Acuerdo/T&C aprobados | Open |
| CA-SC01 | Tipos cerrados y único traductor wire con `Unknown`. | Plataforma | ADR + plan de contract tests | Open |
| CA-SC02 | Operation key, dedupe local y límites de idempotencia remota. | Plataforma | Modelo + plan de replay/concurrencia | Open |
| CA-SC03 | Timeout ambiguo, conciliación y política de retry. | Plataforma + operaciones | Secuencias + plan de crash/recovery | Open |
| CA-SC04 | Outbox/inbox, atomicidad y ownership frente a shipment manual. | Plataforma | ADR/modelo físico | Open |
| CA-SC05 | Capability `CARRIERS`, READ_ONLY/ACTIVE y kill switch. | Producto + plataforma | Política operativa | Open |
| CA-SC06 | Seguridad de base URLs, TLS, redirects y límites de respuesta. | Seguridad | Threat model/test plan | Open |
| CA-SC07 | Rótulo PDF: validación, acceso, entrega y descarte. | Seguridad + producto | Política y pruebas | Open |
| CA-SC08 | Minimización, cifrado, redacción y retención de PII/tracking. | Legal + seguridad | Política aprobada | Open |
| CA-SC09 | Polling, backoff, presupuesto, 429 y observabilidad saneada. | SRE + plataforma | Runbook y plan de pruebas | Open |
| CA-SC10 | Instalación, upgrade, rollback, alertas y homologación E2E. | SRE + QA | Plan de aceptación ejecutable; evidencia en CA-T06/T07 | Open |
