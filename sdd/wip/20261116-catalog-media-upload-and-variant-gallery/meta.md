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
`44961959590` 7/7) persiste las reviews de #331/#332. PR #335 (head `1b143d5`, merge `9030319`, Verify
`44965939283` 7/7, dos Grok 4.7 APPROVED) arranca el `.service` worker
derivado con runtime Java/jar root-owned y SELF_TEST `result.bin` uid
2102; no cierra UID A/B ni `NORMALIZE`. PR #338 (head `df37702`,
merge `e7909f6`, Verify `44969344387` 7/7, dos Grok 4.7 APPROVED)
atesta `request.bin` uid 2101 y `result.bin` uid 2102; no cierra
`NORMALIZE`, cgroup ni `Ready`. PR #340 (head `9bd0063`, merge
`b8d3c62`, Verify `44972840444` 7/7, dos Grok 4.7 APPROVED) corre
`NORMALIZE` dentro de la unidad con `input.bin` uid 2101 y
`output.bin`/`result.bin` Accepted uid 2102; no cierra cgroup, proceso
UID A ni `Ready`. PR #342 (head `de9f964`, merge `c2d0413`, Verify
`44975913833` 7/7, dos Grok 4.7 APPROVED) atesta el cgroup v2 del
worker vía `ControlGroup`; no fija cuota ni cierra `Ready`. PR #346
(head `caed99f`, merge `2aa276c`, Verify `44984436471` 7/7, dos Grok 4.7
APPROVED) deriva `MemoryMax=192MiB`, `MemorySwapMax=0` y `TasksMax=64`;
no cierra `CPUQuota`, aislamiento ni `Ready`. PR #348 (head
`15b9e51`, merge `64796e5`, Verify `44986626639` 7/7, dos Grok 4.7
APPROVED) atesta dos `JobId` con `ReadWritePaths` igual al `Where`
propio; no cierra proceso UID A, fallos/reinicio ni `Ready`. PR #350
(head `3fe28fe`, merge `59da884`, Verify `44989524553` 7/7, dos Grok 4.7
APPROVED) atesta un proceso UID A que no recorre el tmpfs `03770`; no
cierra fallos/reinicio ni `Ready`. PR #353 (head `1980148`,
merge `94c2747`, Verify `44992591084` 7/7, dos Grok 4.7
APPROVED) atesta `UNKNOWN_EXIT` (`status=2` en journal) y
reinicia el mismo `JobId` con `SELF_TEST`; no cierra rechazo
de sustitución ni `Ready`. PR #355 (head `7319204`,
merge `dceb02d`, Verify `44994529755` 7/7, dos Grok 4.7
APPROVED) atesta `RuntimeError::DigestMismatch` del jar
sustituido y no arranca el worker; no cierra OOM/timeout,
terminación del cgroup ni `Ready`. PR #358 (head `cda8f48`,
merge `7694e77`, Verify `45000735868` 7/7, dos Grok 4.7
APPROVED) congela el `MainPID` y atesta `RuntimeMax`; no
cierra OOM, terminación del cgroup ni `Ready`. PR #360 (head
`873cffc`, merge `b658cf9`, Verify `45472580402` 7/7, dos Grok
4.7 APPROVED) atesta oom-kill del cgroup worker; no cierra
terminación del cgroup ni `Ready`. PR #366 (head `0a02b58`,
merge `ff30b8a`, Verify `45534853760` 7/7, dos Grok 4.7
APPROVED) atesta `StopUnit` con `KillMode=control-group` y
`KillSignal=SIGKILL`; no cierra `CPUQuota`, cuota global ni
`Ready`. PR #374 (head `69827b8`, merge `c146fdd`, Verify
`45541300889` 7/7, dos Grok 4.7 APPROVED) deriva
`LimitNOFILE=1024` y deja fuera `RestrictAddressFamilies`
(`ENXIO`); no cierra namespaces, cuota global ni `Ready`. PR #377
(head `bc7bf20`, merge `c6cf882`, Verify `45547855613` 7/7, dos
Grok 4.7 APPROVED) deriva `PrivateNetwork=true`; no cierra cuota
global ni `Ready`. PR #379 (head `7b897cc`, merge `6704455`, Verify
`45551795655` 7/7, dos Grok 4.7 APPROVED) deriva `LimitNPROC=64`;
no cierra cuota global ni `Ready`. PR #381 (head `6e4d1c9`, merge
`083d834`, Verify `45556235165` 7/7, dos Grok 4.7 APPROVED) deriva
`LimitCORE=0`; no cierra cuota global ni `Ready`. PR #383 (head
`d7f773a`, merge `f5e27b3`, Verify `45560675895` 7/7, dos Grok 4.7
APPROVED) deriva `LimitFSIZE` al workspace `48 MiB`; no cierra cuota
global ni `Ready`. PR #385 (head `792397c`, merge `f242dff`, Verify
`45569539383` 7/7, dos Grok 4.7 APPROVED) deriva `LimitCPU=12`; no
cierra `CPUQuota` ni `Ready`. PR #387 (head `733a6ae`, merge `5a80863`,
Verify `45574676365` 7/7, dos Grok 4.7 APPROVED) deriva
`PrivateTmp=true`; no cierra cuota global ni `Ready`. PR #389 (head
`c847ca9`, merge `d6d1f93`, Verify `45627692228` 7/7, dos Grok 4.7
APPROVED) deja `ProtectHome` fuera (`ENXIO`); no cierra cuota global ni
`Ready`. PR #391 (head `d9d1913`, merge `5f77f39`, Verify `45635171309`
7/7, dos Grok 4.7 APPROVED) deriva `PrivateDevices=true`; no cierra
cuota global ni `Ready`. PR #393 (head `8c006b5`, merge `95d322c`, Verify
`45643109921` 7/7, dos Grok 4.7 APPROVED) deriva
`RestrictRealtime=true`; no cierra cuota global ni `Ready`. PR #395 (head
`0cd6c93`, merge `887949d`, Verify `45651635908` 7/7, dos Grok 4.7
APPROVED) deriva `LockPersonality=true`; no cierra cuota global ni
`Ready`. PR #397 (head `8156b7c`, merge `1fad60f`, Verify `45661670755`
7/7, dos Grok 4.7 APPROVED) deriva `ProtectKernelTunables=true`; no
cierra cuota global ni `Ready`. PR #399 (head `b8ab5a3`, merge `866a3df`,
Verify `45674345804` 7/7, dos Grok 4.7 APPROVED) deriva
`ProtectControlGroups=true`; no cierra cuota global ni `Ready`. PR #401
(head `80b9ff6`, merge `e3f3cd4`, Verify `45682148495` 7/7, dos Grok 4.7
APPROVED) deriva `ProtectHostname=true`; no cierra cuota global ni
`Ready`. PR #403 (head `c18fe2a`, merge `711c8c0`, Verify `45690798203`
7/7, dos Grok 4.7 APPROVED) deriva `RestrictSUIDSGID=true`; no cierra
cuota global ni `Ready`. PR #405 (head `8cebbfc`, merge `0fb102d`, Verify
`45699737406` 7/7, dos Grok 4.7 APPROVED) deriva `ProtectClock=true`; no
cierra cuota global ni `Ready`. PR #407 (head `0289b53`, merge `3fd9f59`,
Verify `45708331318` 7/7, dos Grok 4.7 APPROVED) deriva
`ProtectKernelLogs=true`; no cierra cuota global ni `Ready`. PR #409
(head `dc6219c`, merge `77fbe29`, Verify `45727472681` 7/7, dos Grok 4.7
APPROVED) deriva `ProtectKernelModules=true`; no cierra cuota global ni
`Ready`. PR #411 (head `ca23f75`, merge `3aaced7`, Verify `45743360147`
7/7, dos Grok 4.7 APPROVED) deriva `LimitAS` 32× heap (`RLIMIT_AS`); no
cierra cuota global ni `Ready`. PR #413 (head `af49a66`, merge
`cca4c89`, Verify `45839402157` 7/7, dos Grok 4.7 APPROVED) deriva
`LimitDATA` 32× heap (`RLIMIT_DATA`); no cierra cuota global ni
`Ready`. PR #416 (head `037fadb`, merge `36b08b8`, Verify `45866580240`
7/7, dos Grok 4.7 APPROVED) deriva `LimitSTACK=8MiB` (`RLIMIT_STACK`);
no cierra cuota global ni `Ready`. PR #326
arranca
`003B-4B-4` (head `7afcbfa`, merge `2994043`, Verify
`44940481556` 6/6, dos Grok 4.7 APPROVED) con adapter stdio y capability
bloqueada; no devuelve `Ready` ni cierra el agregado. Siguen abiertos
`003B-4B-3`, `003B-4B-4`, `003B-4C` y el agregado `003B-4B`. Esos gates
propios deben cerrarse antes de que `003B-4`, TASK-005 o #7 puedan
cerrarse.

No existe GO live para Cloudinary, credenciales, HTTP upload, deploy ni
homologación externa hasta cerrar sus gates separados.
