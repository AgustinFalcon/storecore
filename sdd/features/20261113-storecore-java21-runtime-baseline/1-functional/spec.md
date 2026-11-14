# Especificación funcional — baseline Java 21

## Objetivo

Actualizar la plataforma de ejecución de StoreCore a Java 21 sin modificar el
comportamiento observable del administrador, comprador, pagos, inventario ni
acceso unificado.

## Resultado observable

- El backend compila y ejecuta su suite con Java 21.
- El CI usa Java 21 tanto en el backend como en el E2E real.
- La guía del E2E real declara el mismo prerrequisito que CI y Maven.
- No cambian endpoints, payloads, estados, roles, flujos ni persistencia.

## Fuera de alcance

- Incorporar dependencias, adapter, DDL, scheduler o endpoints fiscales.
- Elegir emisor, servicio ARCA, punto de venta o matriz de comprobantes.
- Agregar credenciales, certificados, secretos o datos reales.
- Cambiar versiones lógicas de Flyway que contengan el número `17`.
- Declarar homologación, producción o `release/1.0`.

## Criterios de aceptación

1. `backend/pom.xml`, las dos matrices Java del workflow y la guía E2E indican
   Java 21 sin referencias operativas restantes a Java 17.
2. La suite backend completa pasa bajo JDK 21.
3. Backend, frontend y `unified-access-real-e2e` pasan en GitHub Actions.
4. No existe diff de dominio, contrato HTTP, DDL o datos de producción.
5. Dos revisiones independientes aprueban compatibilidad y seguridad del corte.

## Rollback

Revertir este único commit restaura Java 17. No se requiere migración de datos
ni compensación funcional porque el corte no modifica estado persistido.
