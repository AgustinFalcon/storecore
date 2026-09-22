# Project Configuration — StoreCore

> Canonical configuration, 2026-09-21. Deny-by-default.

## Producto y despliegue

```yaml
product:
  release_baseline: sdd-v1.0.0
  core_capability_release: storecore-core-v1.0.0
  deployment_model: single-tenant-per-vm-client
  installation_scope: one merchant, one VM, one PostgreSQL database, one domain
  universal_tools_profile: universal-tools-profile@1.0.0
  profile_contract: importable-versioned-config-fixtures; compatible-with-core-1.x
  anti_goals: [shared-runtime, store_id, store_hosts, marketplace, dynamic-ddl, fiscal-avoidance, pos-domain]
stack:
  backend: Kotlin/Spring Boot 3.x hexagonal
  frontend: Angular 22 clean architecture
  database: PostgreSQL 16 with Flyway
```

## Core `storecore-core-v1.0.0`

Producción merchant-agnostic: storefront, catálogo/search, marcas/categorías, ofertas, home configurable, carrito, checkout Mercado Pago, customer profile/address, órdenes, fulfillment manual básico, stock WEB, sync autorizado de Mercado Libre, y admin de catálogo/contenido/promos manuales.

## Límites y decisiones

- Cada instalación contiene un comercio; no hay `store_id`, host routing ni consultas cross-client.
- Universal Tools se importa explícitamente por versión y merge revisable; no reescribe histórico, secretos ni reglas de dominio.
- WEB es writer local de reservas/consumo; ML sincroniza sólo mediante cuenta autorizada y contratos oficiales. POS queda fuera del core; el companion BlackStore se especifica en `storecore-pos-integration-contract-v1` (WIP, no approved).
- Fiscal es una biblioteca/repositorio externo diferido: requiere D-01..D-07, evidencia de titular/contador y Sol GO; no hay DDL ni tarea ejecutable fiscal.
- Market intelligence y automatizaciones comerciales se separan en features diferidos, con APIs oficiales, licencia y control humano cuando corresponda.
- No existen feature flags genéricos o permanentes. Configuración tipada, estados de capability y kill switches acotados son los únicos mecanismos permitidos.
