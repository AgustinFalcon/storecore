---
id: 20261113-storecore-arca-library-readiness
title: Reconciliación de disponibilidad de la biblioteca ARCA para StoreCore
status: external_decisions_pending
maturity: documented_readiness
owner: platform
created: 2026-11-13
related:
  - ../20260921-arca-fiscal-discovery
  - ../20260921-arca-storecore-adapter-contract
---

# Metadatos

Este corte reconcilia el contrato diferido de StoreCore con el candidato real
`com.agusstkd.arca:*:0.1.0-RC.4` del repositorio externo
`AgustinFalcon/arca-facturacion`, `master 8efeace434103e94f69ad1bce94a9d6dfe2cf7ec`.

La biblioteca ya ofrece estados cerrados, traductores fail-closed, doubles y un
módulo JDBC/worker de referencia con idempotencia, fencing, lock de serie,
outbox y conciliación. Esto elimina el antiguo supuesto de "biblioteca aún no
implementada", pero no publica un paquete remoto, no selecciona la política
fiscal de este comercio y no autoriza código consumidor, credenciales, emisión,
homologación o producción.

El siguiente WIP implementable de StoreCore sólo puede abrirse al cerrar las
decisiones fiscales y de producto enumeradas en el contrato de 2026-09-21. Los
secretos se resolverán por referencia fuera del repositorio.
