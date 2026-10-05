# Especificación — capability admin Tx-C

V10 crea sólo la infraestructura compartida Tx-C sobre master V9; V20 sólo retira overloads existentes sobre integración V19. Funciones schema-qualified, `search_path` seguro, roles mínimos, sesión ADMIN vigente, actor coincidente, versión, correlación, idempotencia, auditoría durable y rollback atómico. Sin companion/DSP, frontend, login, fiscal, carrier ni secretos.

Pruebas obligatorias: instalación nueva y `flyway validate` por linaje; upgrades master V8→V9→V10 y V9→V10; integración V19→V20; checksums históricos intactos; rechazo de historial equivocado; invocación real de seis firmas como runtime denegada; PUBLIC y membresías heredadas sin EXECUTE; ADMIN válido funciona; sesión revocada/expirada, OPERATOR, actor ajeno, module mismatch, versión stale, payload distinto, replay y tablas temporales falsificadas fallan sin efectos.

Los estados, comandos y errores son tipos cerrados con `Unknown`; JSON entra por un traductor único. El dominio no importa Spring, HTTP ni Angular.
