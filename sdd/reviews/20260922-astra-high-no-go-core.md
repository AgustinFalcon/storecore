# Review adversarial del core — GPT-6 Astra (high)

**Fecha:** 2026-09-22  
**Veredicto:** NO-GO para `/sdd.finish`, release 1.0.0 e integración productiva BlackStore. GO para continuar la implementación correctiva.

El GO Sol anterior habilitó construir el baseline; no constituye aceptación final. El backend pasó 44 tests antes de este pase y el frontend pasa arquitectura, lint, 42 tests y build después de corregir el lint. Esas pruebas no cubrían los gaps siguientes.

## MUST-FIX de identidad (TASK-004)

1. Origin de mutación admite fallback basado en Host y no sólo el origen de instalación configurado.
2. Una sesión mantenida viva mediante lecturas no puede renovar CSRF cuando vence el token original.
3. Login interno sin roles vigentes emite sesión/cookie y recién la siguiente petición falla.
4. Respuestas exitosas de identidad con CSRF o datos personales carecen de `Cache-Control: no-store`; alinear 204 de eliminación de dirección.
5. Evidencia de concurrencia CSRF y rollback de bootstrap no prueba el límite transaccional real.

También revisar limitador de login por cardinalidad, revocación de sesión propia y logout concurrente.

## MUST-FIX de producto y datos

- TASK-005/007: guardar catálogo sobrescribe disponibilidad sin ledger; precio y stock visibles no reflejan oferta/safety stock.
- TASK-006/007: replay de checkout con misma clave y otra dirección puede devolver una orden anterior; snapshot de entrega incompleto; claim PENDING no tiene frontera durable previa; falta consumo/liberación WEB y scheduler de expiración.
- TASK-008/014: inbox MP/ML acepta notificaciones sin comprobación contractual de autenticidad/cuenta; payload MP persiste body completo y ML deduplica de forma insuficiente. No inventar un HMAC sin contrato oficial.
- TASK-009: promo fija 10%, no verifica margen, usa cuenta ML ficticia para precio local y no audita correctamente aprobación.
- TASK-010: backend aceptaba saltos de estado y frontend no reconocía estados persistidos. Corregidos código y pruebas en esta tanda; pendiente review de aceptación.
- TASK-012: importación de perfil registra una fila sin aplicar datos; preview enumera claves, no compara la instalación.
- TASK-013/015: review de aceptación y release gate pendientes después de los fixes.

## Evidencia de esta tanda

- `npm run verify`: arquitectura, lint, 42 tests y build OK.
- `mvn -q -Dtest=CommerceHttpIntegrationTest test`: 5 tests, 0 fallos, incluyendo regresiones de envío.
- `git diff --check`: sin errores de whitespace.

Los estados de `tasks.json` se reabren por evidencia adversarial. El WIP POS/BlackStore sigue bloqueado por su gate propio; esta revisión no lo aprueba.
