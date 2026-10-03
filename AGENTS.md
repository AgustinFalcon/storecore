# StoreCore: guía para agentes

Repositorio SDD-only. El baseline vigente es una instalación single-tenant por VM/cliente: un comercio, una base PostgreSQL y un dominio. No implementar shared runtime, `store_id`, `store_hosts` ni TenantFilter salvo futura feature SaaS aprobada por Sol.

Leer `sdd/STATUS.md`, `sdd/PROJECT.md`, `sdd/PATTERNS.md` y el WIP activo antes de actuar. El WIP tenancy anterior es histórico/superseded. Universal Tools es un perfil de configuración/fixtures importable; nunca hardcodear un cliente, dominio, credencial, SKU, precio o comportamiento.

## Reglas críticas

- USER y CUSTOMER son identidades/rutas separadas.
- El core sólo implementa contratos explícitos del WIP. Integraciones de venta física y fiscal son externas/diferidas: sin adapter, DDL, emisión ni evasión/ocultamiento aquí.
- `master` es la línea de homologación del core y puede conservar UX/motores locales fail-closed, pero no activa la integración operativa StoreCore↔BlackStore. Esa integración se prepara en `release/1.0` únicamente después de homologar facturación/ARCA y Correo Argentino. No retargetear ni mergear en bloque `integration/storecore-int` sobre `master`; promover capacidades por cortes revisables y preservar migraciones ya publicadas.
- Cualquier notificación externa futura se autentica y valida según su contrato oficial configurado, se persiste durable antes de efectos y falla retryable si no queda durable.
- Market intelligence diferido usa fuentes permitidas/licenciadas y read-only.
- Prototype Angular mantiene repository fixtures y banner DEMO; producción usa adapter HTTP.
- Preservar cambios locales; no desplegar, usar secretos, taggear ni publicar.

## Flujo multiagente

1. Sol revisa y propone gates.
2. Terra actualiza specs, plan, trazabilidad y docs.
3. Sol declara GO/NO-GO.
4. Luna implementa únicamente tareas con GO.
5. Todo PR se mergea sólo tras dos reviews independientes GPT-6.1 Sol en paralelo (ver `.cursor/rules/pr-dual-sol-review.mdc`): leen descripción, diff y motivo, validan, revisan código y registran proveedor/modelo/esfuerzo/SHA; si piden mejoras se implementan; ambos `APPROVED` y close-out SDD honesto antes del merge. El approve no es un click humano en GitHub.
