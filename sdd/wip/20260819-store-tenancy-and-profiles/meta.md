> **SUPERSEDED 2026-09-21:** ver sdd/wip/20260921-single-tenant-installation-baseline/. Histórico; no implementar.

# Feature: Aislamiento multi-tienda y perfiles de catálogo

**Feature Name**: store-tenancy-and-profiles
**Feature ID**: feat-20260819-store-tenancy-and-profiles
**Feature UUID**: 15ca7fb9-22a1-4985-9076-5a1a4f776b5f
**Status**: superseded
**Mode**: standard
**Project mode**: greenfield
**Project type**: mvp
**Platform**: fullstack
**spec_language**: es
**framework.version_created**: 1.8.0
**ltp.enabled**: false
**GitHub**: https://github.com/AgustinFalcon/storecore/issues/1
**Milestone**: https://github.com/AgustinFalcon/storecore/milestone/1

## Description

Un mismo código StoreCore sirve a muchos comerciantes. Cada tienda tiene dominio propio, datos aislados por `store_id`, onboarding de rubro (ropa, herramientas, alimentos, genérico) y una pestaña de Configuración. No se crean tablas dinámicas ni un mall tipo Mercado Libre.

## Saved context

El fundador quiere muchos clientes, dominio propio por tienda (no un dominio compartido tipo marketplace), el mismo código para todos, onboarding de “qué vas a vender”, y configuración en admin. Rechazó DDL dinámico. Pidió lo profesional y abstracto aunque empiece con 5–20 clientes.

## Stages

stages:
  functional:
    status: superseded
    revised_at: 2026-09-21T21:00:00Z
    revision_note: Histórico; baseline vigente es 20260921-single-tenant-installation-baseline.
  technical:
    status: superseded
    revised_at: 2026-09-21T21:00:00Z
    revision_note: Histórico; no Flyway ni código desde este WIP.
  tasks:
    status: superseded
    strategy: batched
    generated_at: 2026-09-21T00:00:00Z
    revision_note: 21 tareas históricas; no ejecutar.
  implementation:
    status: cancelled_superseded
## Relationship Check

relationship_check:
  performed_at: 2026-08-19T04:40:00Z
  tier: ACKNOWLEDGED
  decision: superseded_by_single_tenant_baseline
  decided_at: 2026-08-19T04:40:00Z
  decided_by: Agustin Falcon
  candidates: []
  candidates_weak: []
  candidates_dropped_by_llm: []
  dismissed_conflicts: []
  acknowledged_conflicts:
    - sdd/specs/functional-spec.md#multi_tenant-fase-1
    - sdd/specs/technical-spec.md#redis-cart-jwt-paths-angular-15
    - sdd/extracted/GAPS.md#multi-tenant-intencional
    - docs/04-MODELO-DATOS-MVP.md#uniques-globales-una-fila-stores
    - docs/07-RUNBOOK-DEPLOY-CLIENTE.md#vm-por-cliente

relates_to:
  - path: sdd/wip/20260921-single-tenant-installation-baseline/1-functional/spec.md
    relationship_type: superseded_by
    note: Single-tenant VM/base/cliente is the live baseline. This WIP is historical evidence only.

## Database Migrations

migration:
  detected: true
  service_name: storecore-postgres
  service_type: postgresql
  branch_name: null
  branch_status: pending
  migration_files: []

user_profile:
  type: technical
  source: global
  selected_at: 2026-08-19T04:15:00Z

vision_prompt_shown: true
