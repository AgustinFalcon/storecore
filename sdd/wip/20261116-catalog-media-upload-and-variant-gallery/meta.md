# Catalog media upload and variant gallery

- Estado: `implementation_in_progress`
- Fecha: 2026-11-16
- Issue: #7
- Base: `master@e0fef1054f8629b8b51a6fd03e5a47b6726d36ab`
  (merge PR #315; candidato final `104a6dc6e658a3cd1b91a7d9bccdee6549e0ad08`)
- Rama: `feat/media-isolation-broker-contract-20261120`
- Perfil: técnico
- Relación: reemplaza únicamente el diseño media del antiguo WIP multi-tenant;
  no reabre tenancy ni agrega `store_id`.

## Objetivo

Permitir que un ADMIN cargue imágenes reales desde el editor de catálogo,
ordene la galería de un producto y asocie imágenes concretas a sus variantes,
sin exponer secretos del proveedor ni hacer que la UI persista URLs arbitrarias
como autoridad de media administrada.

## Gate actual

Las especificaciones y las 15 tareas siguen vigentes. TASK-001/002/004 están
integradas; TASK-003 continúa abierto aunque el claim atómico MEDIA-CREATE y los
subcortes durables previos ya fueron entregados. No se reimplementan.

MEDIA-NORMALIZE-003B-1/2/3 y `003B-4A`/`003B-4B-1`/`003B-4B-2` están
integrados. PR #320 arranca `003B-4B-3` (`FakeSystemd`, no PID 1). PR #328
(head `7155a8e`, merge `4cbd801`, Verify `44950931261` 6/6, dos Grok 4.7
APPROVED) agrega `.mount` escapado, worker `.service` con `ExecStart`
interno y adapter blocking `zbus`; `FakeSystemd` sigue en tests y CI no
abre el system bus. PR #330 (head `e297856`, merge `cc19634`, Verify
`44952793361` 6/6, dos Grok 4.7 APPROVED) deriva internamente
`mode=03770,uid=0,gid=<worker>`, `DirectoryMode=03770` y `NoNewPrivileges`.
PR #331 (head `32d6c7c`, merge `223513d`, Verify `44955708647` 6/6, dos
Grok 4.7 APPROVED) deriva `ProtectSystem=strict` y `ReadWritePaths` del
`Where` del job. PR #332 (head `d9f6dac`, merge `0cccaaf`, Verify
`44960599616` 7/7, dos Grok 4.7 APPROVED) atesta el tmpfs derivado vía
PID 1 en CI. PR #334 (head `5fe84c7`, merge `a20b4ad`, Verify
`44961959590` 7/7) persiste las reviews de #331/#332. El corte worker
PID 1 SELF_TEST arranca el `.service` derivado con runtime Java/jar
root-owned; no cierra UID A/B ni `NORMALIZE`. PR #326 arranca
`003B-4B-4` (head `7afcbfa`, merge `2994043`, Verify
`44940481556` 6/6, dos Grok 4.7 APPROVED) con adapter stdio y capability
bloqueada; no devuelve `Ready` ni cierra el agregado. Siguen abiertos
`003B-4B-3`, `003B-4B-4`, `003B-4C` y el agregado `003B-4B`. Esos gates
propios deben cerrarse antes de que `003B-4`, TASK-005 o #7 puedan
cerrarse.

No existe GO live para Cloudinary, credenciales, HTTP upload, deploy ni
homologación externa hasta cerrar sus gates separados.
