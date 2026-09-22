# Revisión técnica y seguridad — 2026-09-20

**Revisor:** agente independiente (gpt-5.6-sol)  
**Veredicto:** BLOCK para Flyway/kernel funcional; el esqueleto no sustituye los contratos P0.

## Bloqueantes

1. `primary_host UNIQUE` y `admin_host UNIQUE` separados permiten que un Host pertenezca a superficies de tiendas distintas. Se requiere `store_hosts` o constraint equivalente.
2. FKs simples con `store_id` permiten referencias cross-tenant. Se requieren FKs compuestas y pruebas directas PostgreSQL.
3. Webhook contradictorio: callbackKey localiza pero no autentica, firma opcional y ACK 200 ante fallo de DB pueden perder eventos. ACK sólo tras persistencia durable; firma obligatoria para configuración activa.
4. La matriz IDOR mezcla 401 de token/Host mismatch con 404 de recurso inexistente y no prueba recursos cross-store reales.
5. Contratos HTTP, secretos/MP, auth, observabilidad, reproducibilidad y operaciones necesitan gates explícitos.

## Mejoras obligatorias pre-código

- Diccionario V1, OpenAPI estable, modelo Host, integridad tenant, webhook durable y RTM.
- Testcontainers PostgreSQL 16, matriz JWT/IDOR, firma raw-body y pruebas de concurrencia antes del kernel.
- Versiones fijadas, wrappers/lockfiles, secret/dependency scan y gate integrado antes de cualquier release.