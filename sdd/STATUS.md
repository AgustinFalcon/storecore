# Estado canónico del SDD — StoreCore

## En implementación — 2026-11-26, 4C sigue abierto

Siguiente corte: reinicio tras `Starting` y el resto de transiciones
durables. El reinicio tras `Allocated` e `InputSealed`, mmap, FD,
terminales sin ACK, cuota global y RLIMIT quedan atestados. `ProtectHome`,
`RestrictAddressFamilies` y `CPUQuota` quedan fuera. Este documento
no cierra `003B-4C`. Sigue sin familia de sockets ni `Ready`. `003B-4B-3`, `003B-4B-4`,
`003B-4C`, `003B-4`, TASK-005 y #7 siguen abiertos. Este corte no
agrega HTTP de media.

## Master vigente — 2026-11-26, 4C reinicio tras Allocated PR #433

`master 514b18337854b198686f3af91b8fc1c7ca1107d2` integra PR #433. Su
candidato exacto `f54c78857a6c1dd8b2a39191872338bd5b383a26` pasó Verify
`45923481080` 7/7. Dos reviews independientes gpt-5.6-sol-medium
aprobaron sin P0–P3: `sdd/reviews/20261126-sol-pr433-architecture.md` y
`sdd/reviews/20261126-sol-pr433-security.md`. Tras `Allocated`, reabrir
el journal deja `RecoveryPending`; PID 1 no carga unidades; `reconcile`
con inventario ausente reabre admisión. El corte no cierra `003B-4C`:
faltan reinicios del resto de transiciones, familia de sockets y
`Ready`. `003B-4B-3`, `003B-4B-4`, `003B-4`, TASK-005 y #7 siguen
abiertos. No hay HTTP de media.

## Master vigente — 2026-11-26, 4C mmap tras el seal PR #430

`master 6e73d5afaf900a2daa3c0f0dfad91e33e2fc8135` integra PR #430. Su
candidato exacto `695dee9ddbccbe5743646820160ed174063cd7d3` pasó Verify
`45916980019` 7/7. Dos reviews independientes gpt-5.6-sol-medium
aprobaron sin P0–P3: `sdd/reviews/20261126-sol-pr430-architecture.md` y
`sdd/reviews/20261126-sol-pr430-security.md`. El snapshot del tmpfs no
cambia si un mmap `MAP_SHARED` del origen escribe, crece o trunca. El
corte no cierra `003B-4C`: no hay familia de sockets, reinicio ni
`Ready`. `003B-4B-3`, `003B-4B-4`, `003B-4`, TASK-005 y #7 siguen
abiertos. No hay HTTP de media.

## Master vigente — 2026-11-26, 4C FD tras el seal PR #428

`master a2cf84bdea16f3620148e0edebe5c670329fe270` integra PR #428. Su
candidato exacto `b800c659b315d76317374fb77fcf62dcf9bdd560` pasó Verify
`45909048066` 7/7. Dos reviews independientes gpt-5.6-sol-medium
aprobaron sin P0–P3: `sdd/reviews/20261126-sol-pr428-architecture.md` y
`sdd/reviews/20261126-sol-pr428-security.md`. El snapshot del tmpfs no
cambia si el FD del origen se sobreescribe, crece o trunca. El corte
no cierra `003B-4C`: no hay mmap, `CPUQuota`, familia de sockets ni
`Ready`. `003B-4B-3`, `003B-4B-4`, `003B-4`, TASK-005 y #7 siguen
abiertos. No hay HTTP de media.

## Master vigente — 2026-11-26, 4C terminales sin ACK PR #424

`master abfc24c1a623707e62014279eaa6f953b857c519` integra PR #424. Su
candidato exacto `c75a7e1c959ec27459ba5d22023ae90db92df90a` pasó Verify
`45898587594` 7/7. Dos reviews independientes gpt-5.6-sol-medium
aprobaron sin P0–P3: `sdd/reviews/20261126-sol-pr424-architecture.md` y
`sdd/reviews/20261126-sol-pr424-security.md`. Un job `Terminal` sin
`AckOutput` conserva la reserva; el segundo allocate falla `JobLimit`
y PID 1 deja el primer `.mount` Active. El corte no cierra `003B-4C`:
no hay `CPUQuota`, familia de sockets, FD/mmap ni `Ready`. `003B-4B-3`,
`003B-4B-4`, `003B-4`, TASK-005 y #7 siguen abiertos. No hay HTTP de
media.

## Master vigente — 2026-11-26, 4C cuota global PR #420

`master 9d2093289059784a38fdab9e9853fb56ff7c9a52` integra PR #420. Su
candidato exacto `f63631a062d4c4d986cdd3445a6811d06637f663` pasó Verify
`45887600304` 7/7. Dos reviews independientes gpt-5.6-sol-medium
aprobaron sin P0–P3: `sdd/reviews/20261126-sol-pr420-architecture.md` y
`sdd/reviews/20261126-sol-pr420-security.md`. El harness admite el
primer job, rechaza el segundo con `JobLimit` y PID 1 no carga el
segundo `.mount`. El corte no cierra `003B-4C`: no hay `CPUQuota`,
familia de sockets, terminales sin ACK ni `Ready`. `003B-4B-3`,
`003B-4B-4`, `003B-4`, TASK-005 y #7 siguen abiertos. No hay HTTP de
media.

## Master vigente — 2026-11-26, 4C LimitSTACK PR #416

`master 36b08b83d1f80e7642a9fcdfe134a5a16794b9df` integra PR #416. Su
candidato exacto `037fadb1429a4b39bff79c95cdbba1fe2cbe1e9a` pasó Verify
`45866580240` 7/7. Dos reviews independientes Grok 4.7 (autorizadas
porque gpt-5.6-sol-medium estaba sin cupo) aprobaron sin P0–P3:
`sdd/reviews/20261126-sol-pr416-architecture.md` y
`sdd/reviews/20261126-sol-pr416-security.md`. El harness deriva
`LimitSTACK=8MiB` (`RLIMIT_STACK`) y PID 1 lo lee. El corte no cierra
`003B-4C`: no hay `CPUQuota`, familia de sockets, cuota global ni
`Ready`. `003B-4B-3`, `003B-4B-4`, `003B-4`, TASK-005 y #7 siguen
abiertos. No hay HTTP de media.

## Master vigente — 2026-11-26, 4C LimitDATA PR #413

`master cca4c899936a59d602baae49ab7ec34d735778b9` integra PR #413. Su
candidato exacto `af49a66c6a2237f0dda7a7f5983a9d36f1de185a` pasó Verify
`45839402157` 7/7. Dos reviews independientes Grok 4.7 (autorizadas
porque gpt-5.6-sol-medium estaba sin cupo) aprobaron sin P0–P3:
`sdd/reviews/20261126-sol-pr413-architecture.md` y
`sdd/reviews/20261126-sol-pr413-security.md`. El harness deriva
`LimitDATA` al mismo techo 32× heap que `LimitAS` (`RLIMIT_DATA`) y
PID 1 lo lee. El corte no cierra `003B-4C`: no hay `CPUQuota`, familia
de sockets, cuota global ni `Ready`. `003B-4B-3`, `003B-4B-4`, `003B-4`,
TASK-005 y #7 siguen abiertos. No hay HTTP de media.

## Master vigente — 2026-11-26, 4C LimitAS PR #411

`master 3aaced7ce133401286697a4c2a664646df1079fa` integra PR #411. Su
candidato exacto `ca23f75174ed3a71ab1b4efabe1a52dfdd76449a` pasó Verify
`45743360147` 7/7. Dos reviews independientes Grok 4.7 (autorizadas
porque gpt-5.6-sol-medium estaba sin cupo) aprobaron sin P0–P3:
`sdd/reviews/20261126-sol-pr411-architecture.md` y
`sdd/reviews/20261126-sol-pr411-security.md`. El harness deriva
`LimitAS` a 32× el heap `IMAGE_IO_V1` (`RLIMIT_AS`) y PID 1 lo lee. Un
techo igual a `MemoryMax` provoca core-dump del JVM. El corte no cierra
`003B-4C`: no hay `CPUQuota`, familia de sockets, cuota global ni
`Ready`. `003B-4B-3`, `003B-4B-4`, `003B-4`, TASK-005 y #7 siguen
abiertos. No hay HTTP de media.

## Master vigente — 2026-11-25, 4C ProtectKernelModules PR #409

`master 77fbe292b26dfac7c8e22310392ad454f288817e` integra PR #409. Su
candidato exacto `dc6219c3eb0f31d7d539308a665705ddadc74621` pasó Verify
`45727472681` 7/7. Dos reviews independientes Grok 4.7 (autorizadas
porque gpt-5.6-sol-medium estaba sin cupo) aprobaron sin P0–P3:
`sdd/reviews/20261125-sol-pr409-architecture.md` y
`sdd/reviews/20261125-sol-pr409-security.md`. El harness deriva
`ProtectKernelModules=true` y PID 1 lo lee. `media-broker-pid1` usa
`timeout-minutes: 40`. El corte no cierra `003B-4C`: no hay `CPUQuota`,
familia de sockets, cuota global ni `Ready`. `003B-4B-3`, `003B-4B-4`,
`003B-4`, TASK-005 y #7 siguen abiertos. No hay HTTP de media.

## Master vigente — 2026-11-25, 4C ProtectKernelLogs PR #407

`master 3fd9f599c7e2e3c613f4829b09625276c12dec96` integra PR #407. Su
candidato exacto `0289b53dcdd3d83202b484b469afde7ca0183cc4` pasó Verify
`45708331318` 7/7. Dos reviews independientes Grok 4.7 (autorizadas
porque gpt-5.6-sol-medium estaba sin cupo) aprobaron sin P0–P3:
`sdd/reviews/20261125-sol-pr407-architecture.md` y
`sdd/reviews/20261125-sol-pr407-security.md`. El harness deriva
`ProtectKernelLogs=true` y PID 1 lo lee. El corte no cierra `003B-4C`: no
hay `CPUQuota`, familia de sockets, cuota global ni `Ready`. `003B-4B-3`,
`003B-4B-4`, `003B-4`, TASK-005 y #7 siguen abiertos. No hay HTTP de
media.

## Master vigente — 2026-11-25, 4C ProtectClock PR #405

`master 0fb102df9e60589ca2fe4b2c5ec5a2b9459b43c2` integra PR #405. Su
candidato exacto `8cebbfcbaf9f6c4cf0dc76f1709b2e1c02ddfb76` pasó Verify
`45699737406` 7/7. Dos reviews independientes Grok 4.7 (autorizadas
porque gpt-5.6-sol-medium estaba sin cupo) aprobaron sin P0–P3:
`sdd/reviews/20261125-sol-pr405-architecture.md` y
`sdd/reviews/20261125-sol-pr405-security.md`. El harness deriva
`ProtectClock=true` y PID 1 lo lee. El corte no cierra `003B-4C`: no
hay `CPUQuota`, familia de sockets, cuota global ni `Ready`. `003B-4B-3`,
`003B-4B-4`, `003B-4`, TASK-005 y #7 siguen abiertos. No hay HTTP de
media.

## Master vigente — 2026-11-25, 4C RestrictSUIDSGID PR #403

`master 711c8c0ae46c9c970bc40b740a3be6f249b29063` integra PR #403. Su
candidato exacto `c18fe2a92e8dfca8b622ec2c32920fc613f588dd` pasó Verify
`45690798203` 7/7. Dos reviews independientes Grok 4.7 (autorizadas
porque gpt-5.6-sol-medium estaba sin cupo) aprobaron sin P0–P3:
`sdd/reviews/20261125-sol-pr403-architecture.md` y
`sdd/reviews/20261125-sol-pr403-security.md`. El harness deriva
`RestrictSUIDSGID=true` y PID 1 lo lee. El corte no cierra `003B-4C`: no
hay `CPUQuota`, familia de sockets, cuota global ni `Ready`. `003B-4B-3`,
`003B-4B-4`, `003B-4`, TASK-005 y #7 siguen abiertos. No hay HTTP de
media.

## Master vigente — 2026-11-25, 4C ProtectHostname PR #401

`master e3f3cd4a59df5d57371062ac4989d97b779e73ba` integra PR #401. Su
candidato exacto `80b9ff6bb3db93facccb15a3dbef8650a4dbe1ac` pasó Verify
`45682148495` 7/7. Dos reviews independientes Grok 4.7 (autorizadas
porque gpt-5.6-sol-medium estaba sin cupo) aprobaron sin P0–P3:
`sdd/reviews/20261125-sol-pr401-architecture.md` y
`sdd/reviews/20261125-sol-pr401-security.md`. El harness deriva
`ProtectHostname=true` y PID 1 lo lee. El corte no cierra `003B-4C`: no
hay `CPUQuota`, familia de sockets, cuota global ni `Ready`. `003B-4B-3`,
`003B-4B-4`, `003B-4`, TASK-005 y #7 siguen abiertos. No hay HTTP de
media.

## Master vigente — 2026-11-25, 4C ProtectControlGroups PR #399

`master 866a3dfdbaede11b65d62dd4e567a29f15c0fcc2` integra PR #399. Su
candidato exacto `b8ab5a36848c33ff7834ecd9637c85d9f4b6cb61` pasó Verify
`45674345804` 7/7. Dos reviews independientes Grok 4.7 (autorizadas
porque gpt-5.6-sol-medium estaba sin cupo) aprobaron sin P0–P3:
`sdd/reviews/20261125-sol-pr399-architecture.md` y
`sdd/reviews/20261125-sol-pr399-security.md`. El harness deriva
`ProtectControlGroups=true` y PID 1 lo lee. El corte no cierra
`003B-4C`: no hay `CPUQuota`, familia de sockets, cuota global ni
`Ready`. `003B-4B-3`, `003B-4B-4`, `003B-4`, TASK-005 y #7 siguen
abiertos. No hay HTTP de media.

## Master vigente — 2026-11-25, 4C ProtectKernelTunables PR #397

`master 1fad60f03fc1a17788281cce2c42d5dbe79cbf30` integra PR #397. Su
candidato exacto `8156b7c7def82711603395d80038dee904112502` pasó Verify
`45661670755` 7/7. Dos reviews independientes Grok 4.7 (autorizadas
porque gpt-5.6-sol-medium estaba sin cupo) aprobaron sin P0–P3:
`sdd/reviews/20261125-sol-pr397-architecture.md` y
`sdd/reviews/20261125-sol-pr397-security.md`. El harness deriva
`ProtectKernelTunables=true` y PID 1 lo lee. El corte no cierra
`003B-4C`: no hay `CPUQuota`, familia de sockets, cuota global ni
`Ready`. `003B-4B-3`, `003B-4B-4`, `003B-4`, TASK-005 y #7 siguen
abiertos. No hay HTTP de media.

## Master vigente — 2026-11-25, 4C LockPersonality PR #395

`master 887949dc5523d4b66e69330c9c5c4b132d876ff7` integra PR #395. Su
candidato exacto `0cd6c93a03c83020626d0d10495ef8f8ccbf90ec` pasó Verify
`45651635908` 7/7. Dos reviews independientes Grok 4.7 (autorizadas
porque gpt-5.6-sol-medium estaba sin cupo) aprobaron sin P0–P3:
`sdd/reviews/20261125-sol-pr395-architecture.md` y
`sdd/reviews/20261125-sol-pr395-security.md`. El harness deriva
`LockPersonality=true` y PID 1 lo lee. El corte no cierra `003B-4C`: no
hay `CPUQuota`, familia de sockets, cuota global ni `Ready`. `003B-4B-3`,
`003B-4B-4`, `003B-4`, TASK-005 y #7 siguen abiertos. No hay HTTP de
media.

## Master vigente — 2026-11-25, 4C RestrictRealtime PR #393

`master 95d322c0f901b8cdbc7bf1b20d104b7098a1ba30` integra PR #393. Su
candidato exacto `8c006b51f6baaed3d0b0c4193629621f1727c403` pasó Verify
`45643109921` 7/7. Dos reviews independientes Grok 4.7 (autorizadas
porque gpt-5.6-sol-medium estaba sin cupo) aprobaron sin P0–P3:
`sdd/reviews/20261125-sol-pr393-architecture.md` y
`sdd/reviews/20261125-sol-pr393-security.md`. El harness deriva
`RestrictRealtime=true` y PID 1 lo lee. El corte no cierra `003B-4C`: no
hay `CPUQuota`, familia de sockets, cuota global ni `Ready`. `003B-4B-3`,
`003B-4B-4`, `003B-4`, TASK-005 y #7 siguen abiertos. No hay HTTP de
media.

## Master vigente — 2026-11-25, 4C PrivateDevices PR #391

`master 5f77f39d741786ad82451528b2cc0ea24323252b` integra PR #391. Su
candidato exacto `d9d191399590618d45df860b6b8ea7b2605c1d4f` pasó Verify
`45635171309` 7/7. Dos reviews independientes Grok 4.7 (autorizadas
porque gpt-5.6-sol-medium estaba sin cupo) aprobaron sin P0–P3:
`sdd/reviews/20261125-sol-pr391-architecture.md` y
`sdd/reviews/20261125-sol-pr391-security.md`. El harness deriva
`PrivateDevices=true` y PID 1 lo lee. El corte no cierra `003B-4C`: no
hay `CPUQuota`, familia de sockets, cuota global ni `Ready`. `003B-4B-3`,
`003B-4B-4`, `003B-4`, TASK-005 y #7 siguen abiertos. No hay HTTP de
media.

## Master vigente — 2026-11-25, 4C ProtectHome ENXIO PR #389

`master d6d1f9399504dbe150e9e5447e2696e9159a1247` integra PR #389. Su
candidato exacto `c847ca92a103397ca0c1178df4bdddbbd9f46e02` pasó Verify
`45627692228` 7/7. Dos reviews independientes Grok 4.7 (autorizadas
porque gpt-5.6-sol-medium estaba sin cupo) aprobaron sin P0–P3:
`sdd/reviews/20261125-sol-pr389-architecture.md` y
`sdd/reviews/20261125-sol-pr389-security.md`. `ProtectHome` queda fuera
(`ENXIO` Unexpected message contents). El corte no cierra `003B-4C`: no
hay `CPUQuota`, familia de sockets, cuota global ni `Ready`. `003B-4B-3`,
`003B-4B-4`, `003B-4`, TASK-005 y #7 siguen abiertos. No hay HTTP de
media.

## Master vigente — 2026-11-25, 4C PrivateTmp PR #387

`master 5a80863c3355ac1430ac5221a194683d7d1046c3` integra PR #387. Su
candidato exacto `733a6aeec08d58e5756d2c950bddc03ffcf91579` pasó Verify
`45574676365` 7/7. Dos reviews independientes Grok 4.7 (autorizadas
porque gpt-5.6-sol-medium estaba sin cupo) aprobaron sin P0–P3:
`sdd/reviews/20261125-sol-pr387-architecture.md` y
`sdd/reviews/20261125-sol-pr387-security.md`. El harness deriva
`PrivateTmp=true` y PID 1 lo lee. El corte no cierra `003B-4C`: no hay
`CPUQuota`, familia de sockets, cuota global ni `Ready`. `003B-4B-3`,
`003B-4B-4`, `003B-4`, TASK-005 y #7 siguen abiertos. No hay HTTP de
media.

## Master vigente — 2026-11-25, 4C RLIMIT CPU PR #385

`master f242dff98b9f78aae8dbc1b45f8dbc083c70b37d` integra PR #385. Su
candidato exacto `792397cbdebf8e112c839ea3d16e37a427009752` pasó Verify
`45569539383` 7/7. Dos reviews independientes Grok 4.7 (autorizadas
porque gpt-5.6-sol-medium estaba sin cupo) aprobaron sin P0–P3:
`sdd/reviews/20261125-sol-pr385-architecture.md` y
`sdd/reviews/20261125-sol-pr385-security.md`. El harness deriva
`LimitCPU=12` (`RLIMIT_CPU`) y PID 1 lo lee. El corte no cierra
`003B-4C`: no hay `CPUQuota`, familia de sockets, cuota global ni
`Ready`. `003B-4B-3`, `003B-4B-4`, `003B-4`, TASK-005 y #7 siguen
abiertos. No hay HTTP de media.

## Master vigente — 2026-11-25, 4C RLIMIT FSIZE PR #383

`master f5e27b37b587a355bfc866431fbf9d255f1d691f` integra PR #383. Su
candidato exacto `d7f773a5a88c7cc71c901433276a7a3e9910ef04` pasó Verify
`45560675895` 7/7. Dos reviews independientes Grok 4.7 (autorizadas
porque gpt-5.6-sol-medium estaba sin cupo) aprobaron sin P0–P3:
`sdd/reviews/20261125-sol-pr383-architecture.md` y
`sdd/reviews/20261125-sol-pr383-security.md`. El harness deriva
`LimitFSIZE` al tamaño del workspace (`48 MiB`) y PID 1 lo lee. El corte
no cierra `003B-4C`: no hay `CPUQuota`, familia de sockets, cuota global
ni `Ready`. `003B-4B-3`, `003B-4B-4`, `003B-4`, TASK-005 y #7 siguen
abiertos. No hay HTTP de media.

## Master vigente — 2026-11-25, 4C RLIMIT CORE PR #381

`master 083d8340209ad6f8f4a7f85139377df5f60338dc` integra PR #381. Su
candidato exacto `6e4d1c9709f4259575bd1c150d9e5a5d3bd3613b` pasó Verify
`45556235165` 7/7. Dos reviews independientes Grok 4.7 (autorizadas
porque gpt-5.6-sol-medium estaba sin cupo) aprobaron sin P0–P3:
`sdd/reviews/20261125-sol-pr381-architecture.md` y
`sdd/reviews/20261125-sol-pr381-security.md`. El harness deriva
`LimitCORE=0` y PID 1 lo lee. El corte no cierra `003B-4C`: no hay
`CPUQuota`, familia de sockets, cuota global ni `Ready`. `003B-4B-3`,
`003B-4B-4`, `003B-4`, TASK-005 y #7 siguen abiertos. No hay HTTP de
media.

## Master vigente — 2026-11-25, 4C RLIMIT NPROC PR #379

`master 6704455f65e4ded6034b0ed440963a01de612146` integra PR #379. Su
candidato exacto `7b897ccbf17991d36a30783df8a370d6efd8a136` pasó Verify
`45551795655` 7/7. Dos reviews independientes Grok 4.7 (autorizadas
porque gpt-5.6-sol-medium estaba sin cupo) aprobaron sin P0–P3:
`sdd/reviews/20261125-sol-pr379-architecture.md` y
`sdd/reviews/20261125-sol-pr379-security.md`. El harness deriva
`LimitNPROC=64` y PID 1 lo lee. El corte no cierra `003B-4C`: no hay
`CPUQuota`, familia de sockets, cuota global ni `Ready`. `003B-4B-3`,
`003B-4B-4`, `003B-4`, TASK-005 y #7 siguen abiertos. No hay HTTP de
media.

## Master vigente — 2026-11-25, 4C PrivateNetwork PR #377

`master c6cf8823807680cfe8edd953bd4675947d92e5dc` integra PR #377. Su
candidato exacto `bc7bf2038da15d937820ca7bd7b2e1d10996ac89` pasó Verify
`45547855613` 7/7. Dos reviews independientes Grok 4.7 (autorizadas
porque gpt-5.6-sol-medium estaba sin cupo) aprobaron sin P0–P3:
`sdd/reviews/20261125-sol-pr377-architecture.md` y
`sdd/reviews/20261125-sol-pr377-security.md`. El harness deriva
`PrivateNetwork=true` y PID 1 lo lee. El corte no cierra `003B-4C`: no
hay `CPUQuota`, familia de sockets, cuota global ni `Ready`.
`003B-4B-3`, `003B-4B-4`, `003B-4`, TASK-005 y #7 siguen abiertos. No hay
HTTP de media.

## Master vigente — 2026-11-24, 4C RLIMIT NOFILE PR #374

`master c146fdd8c062fa0e75da219e2e84a7d287a1cc14` integra PR #374. Su
candidato exacto `69827b8ed2b41e91daf72c4ad7c50d57c26046df` pasó Verify
`45541300889` 7/7. Dos reviews independientes Grok 4.7 (autorizadas
porque gpt-5.6-sol-medium estaba sin cupo) aprobaron sin P0–P3:
`sdd/reviews/20261124-sol-pr374-architecture.md` y
`sdd/reviews/20261124-sol-pr374-security.md`. El harness deriva
`LimitNOFILE=1024` y PID 1 lo lee. `RestrictAddressFamilies` queda fuera
(`ENXIO` Unexpected message contents). El corte no cierra `003B-4C`: no
hay `CPUQuota`, familia de sockets, namespaces, cuota global ni `Ready`.
`003B-4B-3`, `003B-4B-4`, `003B-4`, TASK-005 y #7 siguen abiertos. No hay
HTTP de media.

## Master vigente — 2026-11-24, 4C terminación del cgroup PR #366

`master ff30b8aaffa5b6ffea077a51c8dedf335ba3e935` integra PR #366. Su
candidato exacto `0a02b5834a9b1a8ae325caf041746dab18d499db` pasó Verify
`45534853760` 7/7. Dos reviews independientes Grok 4.7 (autorizadas
porque gpt-5.6-sol-medium estaba sin cupo) aprobaron sin P0–P3:
`sdd/reviews/20261124-sol-pr366-architecture.md` y
`sdd/reviews/20261124-sol-pr366-security.md`. El harness deriva
`KillMode=control-group` y `KillSignal=SIGKILL`, congela el `MainPID`,
adjunta un `sleep` y atesta que `StopUnit` lo mata. El corte no cierra
`003B-4C`: no hay `CPUQuota`, cuota global ni `Ready`. `003B-4B-3`,
`003B-4B-4`, `003B-4`, TASK-005 y #7 siguen abiertos. No hay HTTP de
media.

## Master vigente — 2026-11-24, calendario comercial HTTP PR #372

`master ac92b03e3dcbfc89de804ce2f50bf30d46e0e316` integra PR #372. No
cierra `003B-4C`. Sigue sin `CPUQuota`, cuota global ni `Ready`.
`003B-4B-3`, `003B-4B-4`, `003B-4`, TASK-005 y #7 siguen abiertos. No hay
HTTP de media.

## Master vigente — 2026-11-24, persist reviews PR #360

`master 7c2a819470ea614d4750b96afd88150a09aab5b7` integra PR #365.
Persiste las dos reviews Grok 4.7 APPROVED de PR #360. No cierra
`003B-4C`. Sigue sin `CPUQuota`, terminación del cgroup ni `Ready`.
`003B-4B-3`, `003B-4B-4`, `003B-4`, TASK-005 y #7 siguen abiertos. No hay
HTTP.

## Master vigente — 2026-11-24, calendario comercial PR #371

`master 4b0e06ab3d6f73ed7d038aa587a9687bef2e10d8` integra PR #371. Cierra
el corte de persistencia del calendario comercial. No cierra `003B-4C`.
Sigue sin `CPUQuota`, terminación del cgroup ni `Ready`. `003B-4B-3`,
`003B-4B-4`, `003B-4`, TASK-005 y #7 siguen abiertos. No hay HTTP de
media.

## Master vigente — 2026-11-24, centro de notificación PR #370

`master 227412d6426cd488a91dd321c166ef8ea20c95be` integra PR #370. No
cierra `003B-4C`. Sigue sin `CPUQuota`, terminación del cgroup ni
`Ready`. `003B-4B-3`, `003B-4B-4`, `003B-4`, TASK-005 y #7 siguen
abiertos. No hay HTTP de media.

## Master vigente — 2026-11-24, 4C OOM del cgroup worker

`master b658cf97c657efd131744befad51b824ea8da68a` integra PR #360. Su
candidato exacto `873cffc8d71d7860b770f0802bec0e51b1cc93a2` pasó Verify
`45472580402` 7/7. Dos reviews independientes Grok 4.7 (autorizadas
porque gpt-5.6-sol-medium estaba sin cupo) aprobaron sin P0–P3:
`sdd/reviews/20261124-sol-pr360-architecture.md` y
`sdd/reviews/20261124-sol-pr360-security.md`. El harness deriva
`KillMode=control-group`, escribe `memory.oom.group=1` en el cgroup v2,
congela el `MainPID` y atesta oom-kill. `MemoryOOMGroup` y `OOMPolicy`
quedan fuera (`PropertyReadOnly`). El corte no cierra `003B-4C`: no hay
terminación del cgroup ni `Ready`. `CPUQuota` sigue fuera. `003B-4B-3`,
`003B-4B-4`, `003B-4`, TASK-005 y #7 siguen abiertos. No hay HTTP.

## Master vigente — 2026-11-24, coordinación comercial fase 1 PR #362

`master 493a582f5caad9b8564d680dc8cf5c6f3d0d23dd` integra PR #362. Aprueba
specs de coordinación comercial fase 1 y congela contratos de
notificación. No cierra `003B-4C`. Sigue sin `CPUQuota`, OOM,
terminación del cgroup ni `Ready`. `003B-4B-3`, `003B-4B-4`, `003B-4`,
TASK-005 y #7 siguen abiertos. No hay HTTP de media.

## Master vigente — 2026-11-22, presentación showcase PR #361

`master 862e5248841025254f4d8a51db543c39cb1aef12` integra PR #361. Completa
la presentación StoreCore poblada. No cierra `003B-4C`. Sigue sin
`CPUQuota`, OOM, terminación del cgroup ni `Ready`. `003B-4B-3`,
`003B-4B-4`, `003B-4`, TASK-005 y #7 siguen abiertos. No hay HTTP de
media.

## Master vigente — 2026-11-22, persist reviews PR #358

`master 5e9bd629cdaed278c3a1cd5745f72f12497342ad` integra PR #359. Persiste
las dos reviews Grok 4.7 APPROVED de PR #358. No cierra `003B-4C`. Sigue
sin `CPUQuota`, OOM, terminación del cgroup ni `Ready`. `003B-4B-3`,
`003B-4B-4`, `003B-4`, TASK-005 y #7 siguen abiertos. No hay HTTP.

## Master vigente — 2026-11-22, 4C timeout del worker

`master 7694e77812318ab23e5fadeb13475f793c3e8e80` integra PR #358. Su
candidato exacto `cda8f48d34482af7becb25910520186d90091411` pasó Verify
`45000735868` 7/7. Dos reviews independientes Grok 4.7 (autorizadas
porque gpt-5.6-sol-medium estaba sin cupo) aprobaron sin P0–P3:
`sdd/reviews/20261122-sol-pr358-architecture.md` y
`sdd/reviews/20261122-sol-pr358-security.md`. El harness deriva
`RuntimeMaxUSec=12s` y `TimeoutStopUSec=1s`, congela el `MainPID` y
atesta que PID 1 corta el worker. FIFO y `RemainAfterExit` sin proceso
no disparan timeout. El corte no cierra `003B-4C`: no hay OOM,
terminación del cgroup ni `Ready`. `CPUQuota` sigue fuera.
`003B-4B-3`, `003B-4B-4`, `003B-4`, TASK-005 y #7 siguen abiertos. No hay
HTTP.

## Master vigente — 2026-11-22, showcase commerce PR #357

`master 8a2ca296f2198f5a918738385e01248c04ff71ba` integra PR #357. Cierra
evidencia commerce del showcase. No cierra `003B-4C`. Sigue sin
`CPUQuota`, OOM/timeout, terminación del cgroup ni `Ready`.
`003B-4B-3`, `003B-4B-4`, `003B-4`, TASK-005 y #7 siguen abiertos. No hay
HTTP de media.

## Master vigente — 2026-11-22, persist reviews PR #355

`master d24742bbb3cee3807c5c87031e20c0fae4dcadd0` integra PR #356. Persiste
las dos reviews Grok 4.7 APPROVED de PR #355. No cierra `003B-4C`. Sigue
sin `CPUQuota`, OOM/timeout, terminación del cgroup ni `Ready`.
`003B-4B-3`, `003B-4B-4`, `003B-4`, TASK-005 y #7 siguen abiertos. No hay
HTTP.

## Master vigente — 2026-11-22, 4C rechazo de sustitución

`master dceb02dcdb02dfebc41b5b48bced50b1b7301e20` integra PR #355. Su
candidato exacto `73192046a927a34a7008f824d40c3c9e260a74a3` pasó Verify
`44994529755` 7/7. Dos reviews independientes Grok 4.7 (autorizadas
porque gpt-5.6-sol-medium estaba sin cupo) aprobaron sin P0–P3:
`sdd/reviews/20261122-sol-pr355-architecture.md` y
`sdd/reviews/20261122-sol-pr355-security.md`. El harness copia el
runtime aprobado, altera el jar y atesta `RuntimeError::DigestMismatch`
por `confirm()`, sin arrancar el worker. El corte no cierra `003B-4C`:
no hay OOM/timeout, terminación del cgroup ni `Ready`. `CPUQuota` sigue
fuera. `003B-4B-3`, `003B-4B-4`, `003B-4`, TASK-005 y #7 siguen
abiertos. No hay HTTP.

## Master vigente — 2026-11-22, persist reviews PR #353

`master 17c6544e36ce03a00186dd2cb4bc07606aa74a2d` integra PR #354. Persiste
las dos reviews Grok 4.7 APPROVED de PR #353. No cierra `003B-4C`. Sigue
sin `CPUQuota`, rechazo de sustitución ni `Ready`. `003B-4B-3`,
`003B-4B-4`, `003B-4`, TASK-005 y #7 siguen abiertos. No hay HTTP.

## Master vigente — 2026-11-22, 4C fallos y reinicio

`master 94c27473d31184a26b1607734012147a83652be2` integra PR #353. Su
candidato exacto `19801483f611ac737c275519766125a08655e97b` pasó Verify
`44992591084` 7/7. Dos reviews independientes Grok 4.7 (autorizadas
porque gpt-5.6-sol-medium estaba sin cupo) aprobaron sin P0–P3:
`sdd/reviews/20261122-sol-pr353-architecture.md` y
`sdd/reviews/20261122-sol-pr353-security.md`. El harness atesta
`UNKNOWN_EXIT` (`status=2` en journal) y reinicia el mismo `JobId` con
`SELF_TEST`. El corte no cierra `003B-4C`: no hay rechazo de
sustitución ni `Ready`. `003B-4B-3`, `003B-4B-4`, `003B-4`, TASK-005 y
#7 siguen abiertos. No hay HTTP.

## Master vigente — 2026-11-22, persist reviews PR #350

`master 5c4444c4e0bbb73db96a3c3b87b80766ce57e504` integra PR #352. Persiste
las dos reviews Grok 4.7 APPROVED de PR #350. No cierra `003B-4C`. Sigue
sin `CPUQuota`, fallos/reinicio, rechazo de sustitución ni `Ready`.
`003B-4B-3`, `003B-4B-4`, `003B-4`, TASK-005 y #7 siguen abiertos. No hay
HTTP.

## Master vigente — 2026-11-22, 4C proceso UID A

`master 59da884d06aabacb08f0a8e5ac056e7d512af0bd` integra PR #350. Su
candidato exacto `3fe28fed07bdbd285341b4861c00eeff69c43152` pasó Verify
`44989524553` 7/7. Dos reviews independientes Grok 4.7 (autorizadas
porque gpt-5.6-sol-medium estaba sin cupo) aprobaron sin P0–P3:
`sdd/reviews/20261122-sol-pr350-architecture.md` y
`sdd/reviews/20261122-sol-pr350-security.md`. Un proceso `setpriv
--reuid=2101` no recorre el tmpfs `03770`. El corte no cierra `003B-4C`:
no hay `CPUQuota`, fallos/reinicio, rechazo de sustitución ni `Ready`.
`003B-4B-3`, `003B-4B-4`, `003B-4`, TASK-005 y #7 siguen abiertos. No hay
HTTP.

## Master vigente — 2026-11-22, 4C aislamiento entre jobs

`master 64796e5133f7ae5361310599d07d0ed12f99f5f2` integra PR #348. Su
candidato exacto `15b9e5180014ce8649e02930e44ab3cf7309c679` pasó Verify
`44986626639` 7/7. Dos reviews independientes Grok 4.7 (autorizadas
porque gpt-5.6-sol-medium estaba sin cupo) aprobaron sin P0–P3:
`sdd/reviews/20261122-sol-pr348-architecture.md` y
`sdd/reviews/20261122-sol-pr348-security.md`. Atesta dos `JobId` con
`ReadWritePaths` igual al `Where` propio. `InaccessiblePaths` queda fuera
por `CHDIR`. El corte no cierra `003B-4C`: no hay `CPUQuota`, proceso
UID A, fallos/reinicio ni `Ready`. `003B-4B-3`, `003B-4B-4`, `003B-4`,
TASK-005 y #7 siguen abiertos. No hay HTTP.

## Master vigente — 2026-11-22, 4C cuota efectiva del worker

`master 2aa276cd7bee7a8a4b6921ed857c5ef96f59d539` integra PR #346. Su
candidato exacto `caed99fb14c9c8c3b50200f95cfce2717f8394a9` pasó Verify
`44984436471` 7/7. Dos reviews independientes Grok 4.7 (autorizadas
porque gpt-5.6-sol-medium estaba sin cupo) aprobaron sin P0–P3:
`sdd/reviews/20261122-sol-pr346-architecture.md` y
`sdd/reviews/20261122-sol-pr346-security.md`. Deriva `MemoryMax=192MiB`,
`MemorySwapMax=0` y `TasksMax=64`. El corte no cierra `003B-4C`: no hay
`CPUQuota`, aislamiento, proceso UID A ni `Ready`. `003B-4B-3`,
`003B-4B-4`, `003B-4`, TASK-005 y #7 siguen abiertos. No hay HTTP.

## Master vigente — 2026-11-22, 4C cgroup v2 del worker

`master c2d0413fb8f6caa1a90dbf4ab38fb9f6c119dc0c` integra PR #342. Su
candidato exacto `de9f964a6fc0a9aaa1d0b54d67419903dbf0c178` pasó Verify
`44975913833` 7/7. Dos reviews independientes Grok 4.7 (autorizadas
porque gpt-5.6-sol-medium estaba sin cupo) aprobaron sin P0–P3:
`sdd/reviews/20261122-sol-pr342-architecture.md` y
`sdd/reviews/20261122-sol-pr342-security.md`. El harness lee
`ControlGroup` y `memory.current`. El corte no cierra `003B-4C`: no hay
cuota, aislamiento, proceso UID A ni `Ready`. `003B-4B-3`, `003B-4B-4`,
`003B-4`, TASK-005 y #7 siguen abiertos. No hay HTTP.

## Master vigente — 2026-11-22, 4C NORMALIZE dentro de la unidad

`master b8d3c6250b2a0943871f61f518e9423a7c4f8f0f` integra PR #340. Su
candidato exacto `9bd0063e2ce0296afb2fbf5de162752c61f9e197` pasó Verify
`44972840444` 7/7 (incluye `media-broker-pid1` con `NORMALIZE` Accepted,
`input.bin`/`request.bin` uid 2101 y `output.bin`/`result.bin` uid 2102).
Dos reviews independientes Grok 4.7 (autorizadas porque gpt-5.6-sol-medium
estaba sin cupo) aprobaron sin P0–P3:
`sdd/reviews/20261122-sol-pr340-architecture.md` y
`sdd/reviews/20261122-sol-pr340-security.md`. El corte no cierra
`003B-4C`: no hay cgroup, aislamiento, proceso UID A ni `Ready`.
`003B-4B-3`, `003B-4B-4`, `003B-4`, TASK-005 y #7 siguen abiertos. No hay
HTTP.

## Master vigente — 2026-11-22, 4C UID A posee request.bin

`master e7909f667aa6799fc3daf1fa148265b929f3749e` integra PR #338. Su
candidato exacto `df37702e74c7047f26ec6988522a88ae28115b88` pasó Verify
`44969344387` 7/7 (incluye `media-broker-pid1` con `request.bin` uid 2101
y `result.bin` uid 2102). Dos reviews independientes Grok 4.7 (autorizadas
porque gpt-5.6-sol-medium estaba sin cupo) aprobaron sin P0–P3 tras un P3
de wording: `sdd/reviews/20261122-sol-pr338-architecture.md` y
`sdd/reviews/20261122-sol-pr338-security.md`. El corte no cierra
`003B-4C`: no hay `NORMALIZE`, cgroup, proceso UID A ni `Ready`.
`003B-4B-3`, `003B-4B-4`, `003B-4`, TASK-005 y #7 siguen abiertos. No hay
HTTP.

## Master vigente — 2026-11-22, 4B-3 worker PID 1 SELF_TEST

`master 9030319adc16f21b0be95f38c9258593d8cbcf73` integra PR #335. Su
candidato exacto `1b143d56ac88cffa1b8bd679ad6794267a0b43a1` pasó Verify
`44965939283` 7/7 (incluye `media-broker-pid1` con worker `SELF_TEST`).
Dos reviews independientes Grok 4.7 (autorizadas porque gpt-5.6-sol-medium
estaba sin cupo) aprobaron sin P0–P3:
`sdd/reviews/20261122-sol-pr335-architecture.md` y
`sdd/reviews/20261122-sol-pr335-security.md`. El corte arranca el
`.service` worker derivado contra PID 1 con runtime Java/jar root-owned
y atesta `result.bin` uid 2102. No cierra `003B-4B-3`: no hay UID A,
`NORMALIZE`, cgroup ni `Ready`. `003B-4B-4`, `003B-4C`, `003B-4`,
TASK-005 y #7 siguen abiertos. No hay HTTP.

## Master vigente — 2026-11-21, 4B-3 persist reviews #331/#332

`master a20b4adc20ea0e1538dc77eadc5863973fcc16d1` integra PR #334 sobre
candidato `5fe84c7e4bd8f6647d38608e27bbbf5d9f082ed3`. Verify
`44961959590` 7/7. Documentación: reviews APPROVED de #331 y #332.
No cierra `003B-4B-3`.

## Master vigente — 2026-11-21, 4B-3 harness PID 1 tmpfs

`master 0cccaaf2b2032414be79cb07bcf30f475fa47605` integra PR #332. Su
candidato exacto `d9f6dacb006eb861544d24b29b9c301cfaf36c54` pasó Verify
`44960599616` 7/7 (incluye `media-broker-pid1`). Dos reviews independientes
Grok 4.7 (autorizadas porque gpt-5.6-sol-medium estaba sin cupo) aprobaron
sin P0–P3 tras un P2: `stop` sólo traduce `NoSuchUnit` a `NotLoaded` /
`Inactive`. El corte abre el system bus en CI como root y atesta el tmpfs
derivado en `/proc/self/mountinfo`. No arranca el worker, no hay UID A/B,
`Ready` ni HTTP. `003B-4B-3` permanece abierto junto con `003B-4B-4`, el
agregado `003B-4B`, `003B-4C`, `003B-4`, TASK-005 y #7.

## Master vigente — 2026-11-21, 4B-3 ProtectSystem=strict

`master 223513d6788afe95b7525efef17281882e7d451e` integra PR #331. Su
candidato exacto `32d6c7c8fceb981e9a038c55a878c64047052567` pasó Verify
`44955708647` 6/6. Dos reviews independientes Grok 4.7 aprobaron sin P0–P3
tras un P1: `ReadWritePaths` derivado del mismo `Where` que
`WorkingDirectory`. El worker envía `ProtectSystem=strict` internamente.
El cliente no suministra esas properties. `003B-4B-3` permanece abierto.

## Master vigente — 2026-11-21, 4B-3 tmpfs/NoNewPrivileges

`master cc19634783ba2c59c8cd44365a37496bb5dd1dda` integra PR #330. Su
candidato exacto `e2978566a7aa6d77abece4f6e724bda4b21fe6a3` pasó Verify
`44952793361` 6/6. Dos reviews independientes Grok 4.7 (autorizadas porque
gpt-5.6-sol-medium estaba sin cupo) aprobaron sin P0–P3. El corte deriva
internamente `mode=03770,uid=0,gid=<worker>`, `DirectoryMode=03770` y
`NoNewPrivileges=true`. El cliente no suministra esas properties.
`FakeSystemd` sigue en tests; CI no abre el system bus. No hay `Ready`,
wiring Spring ni harness UID A/B. `003B-4B-3` permanece abierto junto con
`003B-4B-4`, el agregado `003B-4B`, `003B-4C`, `003B-4`, TASK-005 y #7.

## Master vigente — 2026-11-21, 4B-3 nombres PID 1 y adapter zbus

`master 4cbd801109e060b1918de55eb1ef16abcc2589da` integra PR #328. Su
candidato exacto `7155a8e6c755b55d5d0bbc7e9578c151370deffd` pasó Verify
`44950931261` 6/6. El P3 de `a42bbf4` (Starting antes de derivar `Where`) se
cerró en ese SHA. Dos reviews independientes Grok 4.7 (autorizadas porque
gpt-5.6-sol-medium estaba sin cupo) aprobaron sin P0–P3. El corte entrega
nombres `.mount` escapados, worker `.service` con `ExecStart` interno y
adapter blocking `zbus`. `FakeSystemd` sigue en tests; CI no abre el system
bus. No hay `Ready` ni harness UID A/B. `003B-4B-3` permanece abierto junto
con `003B-4B-4`, el agregado `003B-4B`, `003B-4C`, `003B-4`, TASK-005 y #7.

## Master vigente — 2026-11-21, arranque 4B-4

`master 29940436175451e7db40e79210613970ff82b056` integra PR #326. Su
candidato exacto `7afcbfa0cc1b9bf7b9a5efc25d7a3af319d18fd5` pasó Verify
`44940481556` 6/6. Dos reviews independientes Grok 4.7 (autorizadas porque
gpt-5.6-sol-medium estaba sin cupo) aprobaron sin P0–P3 tras un P2 de ACK
sobre `67551c9`. El corte arranca `003B-4B-4`: `BrokeredMediaByteNormalizer`
en infrastructure, traducción wire única, ACK sólo tras `Accepted`, y
capability `Unknown`/`Unavailable`. No hay `Ready`, wiring Spring, `zbus`,
PID 1 ni harness UID A/B. `003B-4B-4` permanece abierto junto con
`003B-4B-3`, el agregado `003B-4B`, `003B-4C`, `003B-4`, TASK-005 y #7.

## Master vigente — 2026-11-21, arranque 4B-3

`master 1526201285bebfd5c8c4b5ee44a5bf0f05a38aba` integra PR #320. Su
candidato exacto `35b8ce711a6c07e7a1aa5e4b418c9031f9024070` pasó Verify
`44856904469` 6/6. Dos reviews independientes Grok 4.7 (autorizadas porque
gpt-5.6-sol-medium estaba sin cupo) aprobaron sin P0–P3. El corte arranca
`003B-4B-3`: tipos cerrados de unidad/D-Bus/runtime, nombres derivados del
`JobId`, runtime aprobado `NOFOLLOW` y un daemon que no trata `Unknown` como
`Running`. El controlador de este SHA es `FakeSystemd`; no hay `zbus`, PID 1
real, wiring Spring ni `Ready`. `003B-4B-3` permanece abierto junto con
`003B-4B-4`, el agregado `003B-4B`, `003B-4C`, `003B-4`, TASK-005 y #7.

## Master vigente — 2026-11-20, estado durable 4B-2

`master 381296d6e267d4c2813345f3bb635ad927a1aff5` integra PR #319. Su
candidato exacto `9e77bcf8de7b2a874d0998cd43435f999050f85b` pasó Verify
`44837144576` 6/6 y el post-merge `44838436904` terminó 6/6. Dos reviews
independientes Grok 4.7 (autorizadas porque gpt-5.6-sol-medium estaba sin
cupo) aprobaron sin P0–P3. El corte entrega máquina durable/CAS, journal,
budgets y reconciliación fake; no instala daemon D-Bus, mounts, wiring
Spring ni `Ready`. `003B-4B-3..4`, `003B-4C`, `003B-4`, TASK-005 y #7
siguen abiertos.

## Master vigente — 2026-11-20, factory 4A

`master d824e0751010a5f3a5f7e3522329832f02018bd6` integra PR #313. Su
candidato exacto `649f11242b47eca59ef28b9d87febfa85f3acab3` pasó Verify de PR
`44814135015` 5/5, tests focales 23/23 y dos reviews independientes GPT-6.1
Sol sin P0–P3. El primer intento posmerge `44816056376` recibió HTTP 429 de
Maven Central antes de compilar `productive-routes-real-e2e`; el rerun del mismo
SHA terminó 5/5 verde. El corte entrega factory/lifecycle fail-closed y retiene
workspaces cuando no puede acreditar terminación. No devuelve `Ready`: el
handoff cross-UID real (`003B-4B`) y el harness Linux (`003B-4C`) continúan
abiertos, al igual que `003B-4`, TASK-005 y #7.

El baseline anterior `master 28b99b75cb3d683f60f2c1ca547986ef4b8fe0a8`
integra PR #310. Su
candidato exacto `f6bb3a326ddfab23cfe2162ad21c6d805f3c04e5` pasó Verify
`44801937465` 5/5 y el post-merge `44804049350` terminó 5/5. El corte agrega
attestation offline del worker de media; no cierra TASK-003 ni #7 y no acredita
HTTP media, proveedor live, secretos, deploy u homologación.

PR #311 reconcilió exclusivamente evidencia documental: head
`2f1c6e6d1d6aade37931caaabe4db29301fc61d4`, dos reviews GPT-6.1 Sol
APPROVE sin P0–P3, Verify `44801449968` 5/5, merge
`0c02c01cd9887584c20c615d330bfb0b6af2e008` y post-merge `44803001533`
5/5. Ese corte registró como entregados los gates históricos acreditados de
#274, #275, #276, #282, #285 y #308; no amplió su alcance.

El refresh autoritativo de checkout de PR #308 cerró #13. Permanecen abiertos
#7, #8, #104 y #128; #8 conserva Correo Argentino y notificaciones productivas
como residuales. Este estado no acredita Mercado Pago live, ARCA, Correo
Argentino, SMTP productivo, StoreCore↔BlackStore activo, deploy ni
`release/1.0`.

## Master vigente — 2026-11-18, comandos media durables

`master 07a07178214d9e6d0e679356cedad0c5e939ffde` integra PR #300. El
candidato exacto `a6d39499a18c2432fb0956db0a0da6d9432814a8` pasó Verify #802
5/5 (higiene, backend PostgreSQL/interlock, frontend y ambas matrices E2E) y
dos revisiones independientes GPT-6.1 Sol aprobaron sin P0–P3.

El corte integra registro/replay, leases/fencing y borrado/GC durable de media
privada con tombstones reconciliables. TASK-003 permanece en progreso; la
composición CAS se desarrolla en un PR sucesor. No acredita HTTP media,
decoder, Cloudinary live, secretos, deploy ni homologación externa.

## Master vigente — 2026-11-18

`master dc32a3ecbcf65557c670679376a678e6dee1e4ab` integra los cortes #274–#284
y #297. PR #282 quedó fusionado como `214140d0779b8d53505f3e121339b2760aeae185`;
su Verify exact-head `44320781327` y el post-merge `44323153644` terminaron 5/5
verdes, incluido el E2E real de rutas productivas, y #106 quedó cerrado. PR #283
agrega exclusivamente el SDD de media privada sobre ese baseline.

`sdd/wip/20261116-storefront-fulfillment-backlog-reconciliation/` ya apunta a
`master` y reconcilia #8/#13 contra el runtime integrado. No acredita guest cart,
carrier, emails logísticos, Mercado Pago live, ARCA, integración live con
BlackStore, deploy, homologación o release; #8/#13 permanecen abiertos con esos
residuales. Los bloques previos basados en `94d005a` y `dc45c59` son históricos.

## Master vigente — 2026-11-14

`master dc45c5942009d0f80eaf252054a54b8f51182f22` integra PR #271–#273.
El último corte funcional es PR #272, merge
`bfe34661a6d3cd1454a87e280397a3529bfb5abd`: checkout con decisión
autoritativa de retiro o entrega local, costo exacto, snapshots históricos,
revisiones de carrito/dirección y ciclos separados de fulfillment. PR #273
archiva su SDD sin modificar runtime.

Verify del PR #272 `43551669169`, post-merge funcional `43552311370` y
post-merge documental `43553571761` terminaron con backend, frontend y E2E
real verdes. La aceptación local incluye 437 pruebas backend, 1400 frontend,
96 visual/accesibilidad y 23/23 escenarios reales con PostgreSQL, Spring,
Angular HTTPS y navegador. Tres revisiones coordinadas aprobaron sin P0–P3.

La paridad operativa local de Fase 1 no tiene un faltante P0–P3 demostrado en
el código vigente. Su smoke Playwright de alta de catálogo intercepta HTTP: es
evidencia de UI/contrato, no un E2E UI→Spring→PostgreSQL. No se lo presenta
como homologación ni como integración real de proveedor.

Este bloque prevalece sobre cabeceras anteriores. No acredita ARCA, Correo
Argentino, Mercado Pago live, SMTP productivo, StoreCore↔BlackStore activo,
deploy ni `release/1.0`; esos gates permanecen explícitamente separados.

## Master vigente — 2026-11-13

`master ba83f679f51a53025dd49ae87ec8f03097ae5180` integra PR #257–#270.
El último snapshot funcional es `7053e8faba539babbbb0937915742aecfe702339`:
Java 21, moneda Mercado Pago fail-closed, autoridad de moneda de carrito,
continuidad checkout/direcciones, identidad histórica del comprador,
continuidad de intención PDP y autoridad de precio por variante. PR #270 sólo
archiva el SDD de ese último corte.

Los Verify post-merge de las entregas funcionales son `43456288441`,
`43462225801`, `43481720083`, `43497831638`, `43507158447`, `43523386759` y
`43535120746`; todos terminaron con backend, frontend y E2E real verdes. Este
bloque prevalece sobre referencias anteriores a `33fca34`.

No acredita proveedores live, ARCA, Correo Argentino, Mercado Pago real,
StoreCore↔BlackStore activo, deploy, homologación ni `release/1.0`.

## Histórico — cierre de recovery/Origin — 2026-11-13

`master 33fca347031ff8b812ed7bb6d4024318812ef82e` integra PR #244–#253. El
tramo local posterior a `7300b8` agrega discovery honesto de Correo Argentino,
creación real de producto e inventario, recovery CUSTOMER/USER con entrega
verificada y el hardening de la frontera Origin unificada. PR #250 quedó en
`5ba014f`, su cierre documental PR #251 en `99ac6b2` y PR #252 en `376790d`.

Verify #654–#659 registran los gates de PR y post-merge; en particular PR #252
pasó `43312967237` y `master 376790d` pasó `43313975226` con backend, frontend y
`unified-access-real-e2e` verdes. La evidencia focal de PR #252 incluye 36 tests
PostgreSQL 16/Testcontainers sin fallos y `git diff --check` limpio.

PR #253 reconcilió exclusivamente esta documentación: candidato `ccc40537`,
Verify #660 (`43355075159`) y Verify post-merge #661 (`43355855948`) pasaron
backend, frontend y `unified-access-real-e2e`. `376790d` sigue siendo el último
snapshot funcional; `33fca34` sólo agrega el cierre documental canónico.

Este bloque prevalece sobre cabeceras históricas que declaren `7300b8` o un SHA
anterior como vigente. No acredita SMTP productivo, credenciales live,
Mercado Pago real, ARCA, Correo Argentino, StoreCore↔BlackStore activo, deploy
ni `release/1.0`; cada uno conserva su SDD y gate de homologación.

## Histórico — cierre de gates posteriores a stock — 2026-11-11

`master 7300b81674a2f7097825dbedbac4914f07278d20` integra PR #240, el
follow-up PR #241 y el cierre documental RDI PR #243. El ajuste manual de stock conserva autoridad, idempotencia,
auditoría y estados cerrados; el follow-up elimina dos carreras observadas por
el primer Verify de `master`: pérdida de foco durante el refresh autoritativo y
una segunda rotación USER CSRF desde `ShellComponent`.

PR #241 fue revisado sobre el head exacto
`651a8333b07bd17ba78c3e91a35d55a19a52e178` por dos gates GPT-6.1 Sol
independientes (Bug/Producto y Seguridad), ambos `APPROVE` sin P0–P3. Verify de
PR `42905934287` y Verify post-merge de `master` `42907008862` terminaron 3/3
verdes: backend, frontend y `unified-access-real-e2e` con PostgreSQL, Spring,
Angular HTTPS y navegador real.

Este cierre acredita el core local homologable del corte actual. No acredita
credenciales live, Mercado Pago real, ARCA, Correo Argentino, StoreCore↔BlackStore
activo, deploy ni `release/1.0`; esos límites permanecen bloqueados por sus WIP
y homologaciones específicas.

## Política de revisión vigente

Desde 2026-10-03, el gate de revisión para PRs nuevos es **dos revisiones independientes GPT-6.1 Sol en paralelo**, con proveedor, modelo, esfuerzo, SHA base/head, checks y límites registrados. Las referencias a Grok en documentos históricos describen evidencia de cortes anteriores y no son un requisito vigente para nuevos PRs.

**Validado:** 2026-09-23  
**Madurez:** `storecore-core-v1.0.0` archivado en `sdd/features/20260921-single-tenant-installation-baseline/`. Integración: PR #14. No existe TASK-011.  
**Sol GO:** `sdd/reviews/20260922-sol-go-core.md`.  
**Git:** feature branch + finish en el PR. No tag, deploy o publish.

## Residuales honestos

- TASK-008/014 inbox persist-before-ACK done. TODO-041 worker applies only after official refetch (fake in CI; live credentials per installation, never in repo).
- TASK-013: Playwright/axe on public screens (`frontend` `npm run test:a11y`). Stitch is a visual reference, not a pixel baseline.
- TODO-003: fleet runbook complete at `sdd/features/20260921-single-tenant-installation-baseline/2-technical/fleet-operations.md`.

## Precedencia

1. Feature archivado: `sdd/features/20260921-single-tenant-installation-baseline/`.
2. `sdd/PROJECT.md`, `sdd/PATTERNS.md`, `sdd/TRACEABILITY.md`, `sdd/RELEASE.md`.
3. `docs/agent/` es espejo; Company Brain canónico vive en `Novastra/company brain`.
4. `20260819-store-tenancy-and-profiles` y `sdd/specs/*` son históricos/superseded.

## Frontend vigente y procedencia visual

- `sdd/wip/20260923-storecore-frontend-ux-system-v1/` conserva la procedencia visual Stitch; su inventario de 22 rutas es histórico.
- La aceptación ejecutable de las 26 superficies Demo está en `sdd/wip/20261014-storecore-commercial-ux-hardening/4-implementation/evidence/frontend-phase1-client-presentation-closure-20261106.md`; no acredita paridad backend ni proveedores reales.
- El manifiesto PSD registra 25 superficies con ruta productiva y recovery bloqueado por contrato de email. PSD quedó archivado en `sdd/features/20261108-storecore-productive-surface-data-parity/`; Showcase quedó archivado en `sdd/features/20261108-storecore-local-showcase-environment/` como completado mediante hardening sucesor. Ninguno acredita proveedores live ni homologación.
- La navegación paginada local está cerrada en `sdd/features/20261109-storecore-bounded-list-navigation/` (PR #234, candidato `4e99400`, Verify `42675235368`).
- El editor productivo de variantes existentes está cerrado en `sdd/features/20261110-storecore-productive-variant-editor/` (PR #238, candidato `a863a8d`, Verify `42833927010` 3/3 y doble review GPT-6.1 Sol APPROVE). Nombre, estado cerrado y atributos son editables; identidad/SKU, stock, precio y proveedores permanecen fuera de alcance.
- El estado de health del frontend está cerrado en `sdd/features/20261110-storecore-closed-health-status/` (PR #239, candidato `35ae0c3`, Verify `42839213825` intento #2 3/3 y doble review GPT-6.1 Sol APPROVE). El wire se traduce una sola vez; valores futuros o malformados quedan `Unknown` fail-closed y nunca marcan la instalación lista.
- La identidad reactiva de las rutas de detalle ya está presente en el árbol de `master`; su WIP `20261001-reactive-detail-route-identity` cerró RDI-001..005 sobre candidato `4c560f5`, doble review GPT-6.1 Sol APPROVE y Verify `43086417458` 3/3. Permanece sin archivar sólo por toolchain `sdd.finish` no disponible; no es un faltante funcional del frontend.

## Gate actual

El inventario vigente distingue Demo, operaciones productivas locales y bloqueos externos; un conteo de rutas no acredita completitud operativa. Una `checkoutUrl` HTTPS allowlisted es redirección UX, no prueba de cobro. No autoriza release, fiscal/ARCA, tenancy SaaS, DEMO-as-production ni deploy.

### Estrategia de ramas para homologación

- `master` recibe por PRs pequeños el core homologable, seguridad y endurecimientos fail-closed. Cada corte se valida sobre el SHA exacto de `master`; el CI de una rama de integración no se reutiliza como evidencia.
- `integration/storecore-int` conserva la historia y la evidencia combinada POSC/DSP/companion. No se retargetea ni se fusiona completa sobre `master`.
- La integración operativa StoreCore↔BlackStore se arma en `release/1.0` desde el `master` homologado sólo cuando facturación/ARCA y Correo Argentino tengan contratos, adapters y E2E de homologación aprobados. Hasta entonces sigue desactivada, sin credenciales live ni canary.
- Las migraciones ya publicadas no se borran ni renumeran; cualquier separación se hace hacia adelante y con prueba de instalación limpia y upgrade.

La promoción vigente se registra en `sdd/wip/20261002-master-core-hardening/4-implementation/progress.md`; ese addendum separa la procedencia de integración de la evidencia ejecutada sobre el diff real de `master`.

### Acceso unificado StoreCore

`unified-access-entry` está implementado mediante PRs #165–#169 y archivado en
`sdd/features/20261003-unified-access-entry/`. `/login` es la única entrada
visual, pero CUSTOMER y USER conservan principals, cookies, CSRF, sesiones y
autorización separados. El corte funcional de #169 es
`99380a656562c784dc8fc4805eccc2a835a2ea48`; la evidencia real está en Verify
`37526296154` (12/12 PostgreSQL/Spring/Angular HTTPS/Chromium), repetida en
`master` por `37528646167`, y en dos reviews
independientes GPT-6.1 Sol del head exacto. El inventario UA-007 encontró
consumidores ejecutables de los endpoints de credenciales por realm: permanecen
soportados y no deprecados. Su eventual retiro es `TODO-043`. BlackStore no está
federado y este estado no autoriza deploy ni homologación fiscal/carrier.

Tramo implementable MP-LIVE-01–04 **cerrado** (fail-closed, dual Grok APPROVED). El WIP sigue `documented_deferred`; no hay `/sdd.finish` archive mientras MP-LIVE-05 esté bloqueado. Evidencia POS local está registrada abajo y el companion sigue disabled. Fiscal y live siguen NO-GO. No autoriza live vendor credentials, activación ni CI con secretos. GitHub Verify de #16–#18 falló por billing/spending limit (jobs no arrancaron); no se trata como CI verde.

## WIP POS (paralelo, no es el baseline)

- `sdd/wip/20260921-storecore-pos-integration-contract-v1/` — PIC-001..010 y L3-001..003 done a nivel local. HTTP 200/304/409/410/429 + outbox local en Testcontainers; módulo vuelve a DISABLED. PR #19 mergeado en `master` (`18d18f7`) tras dual Grok r2 ambos `APPROVED` (`20260924-grok-pr19-scope-r2.md`, `20260924-grok-pr19-sdd-r2.md`). Verify de #19 no es CI verde. El WIP sigue abierto: companion live, fiscal, MP-LIVE-05 y `/sdd.finish` NO-GO. BlackStore ADP-001..010 + L3 están en el `master` de ese repo. PR #2 (`395ca30`) es el perfil opt-in `loopback`. PR #5 (`c5f6239`) ata el reserve a la variante del catálogo vigente. El release de BlackStore sigue disabled y no es companion live. Fiscal, live y `/sdd.finish` NO-GO.
- `sdd/wip/20260921-pos-sales-ingestion/` — superseded.
- `sdd/wip/20260921-blackstore-pos-operations/` — puntero histórico.

## Fulfillment comercial — aceptación cerrada y SDD archivado

`sdd/features/20261006-commerce-closed-states-and-fulfillment-eligibility/`
conserva el GO documental y la implementación de PR #171, revalidada sobre el
head final de PR #231 `9108798818b0217dcf5bb4685f59a195d63637ae` (merge
`eca9db9f0ba51023c8b785831003cb04d8ba0660`).
Implementa tipos cerrados,
prueba durable de acreditación/SALE WEB, locks order-first y recepción completa
sin inspección ni reposición. En el antecedente PR #171, head `b3e4b3b`, Verify
exact-head `37630043935` terminó success
en frontend, backend y `unified-access-real-e2e`; dos reviews independientes
GPT-6.1 Sol APPROVED sin P0–P3 verificaron ese head y el fingerprint
`459CB299E61B864DB52A5B3E2FB676BC213BA1C94307731BAC5E54F115647572`.
Verify exact-head #594, run `42538029894`, terminó success en frontend, backend
y browser: 1061 tests frontend, 253 backend y 17/17 escenarios (4 CFE reales,
1 Unknown MockHttp y 12 de acceso). La matriz incluye PostgreSQL 16, clean V1–V14, upgrade V8→V9 y
V13→V14, checksums/histórico, autorización, concurrencia, respuesta perdida y
recuperación durable. El candidato documental `4debf9b` pasó Verify
`42653866473` con 3/3 jobs y doble review GPT-6.1 Sol APPROVE; CFE-T06 quedó
cerrada y el SDD archivado. No se afirma CI push de master. Sin homologación,
release, credenciales live ni activación. Progreso/evidencia y límites están en el feature.
La disposición/reposición por ítem quedó cerrada en
`sdd/features/20261109-commerce-rma-item-disposition-and-restock/`: sólo
RESTOCK aumenta stock vendible; dañado/rechazado, idempotencia, auditoría,
recovery y carreras están cubiertos. PR #233 candidato `fc80316`, Verify
`42666041072` 3/3 y doble review GPT-6.1 Sol APPROVE. Sin homologación,
release, credenciales live ni deploy.

## Fiscal externo

- La biblioteca externa alcanzó el candidato `0.1.0-RC.4` en
  `AgustinFalcon/arca-facturacion` `master 8efeace`: estados cerrados,
  conciliación fail-closed, referencia JDBC/worker, 78 pruebas, cobertura
  89,03 %, SBOM, smoke consumidor y CI post-merge Verify/Security verde. No hay
  tag ni paquete remoto acreditado.
- `20260921-arca-fiscal-discovery` y
  `20260921-arca-storecore-adapter-contract` permanecen
  `documented_deferred` para el consumidor StoreCore. El corte
  `20261113-storecore-arca-library-readiness` reconcilia la nueva baseline sin
  habilitar adapter, DDL, scheduler, worker, secretos, homologación ni emisión.
  Matriz fiscal, emisor/PV, trigger, correlaciones, ownership inbox/outbox y
  distribución versionada siguen pendientes de sus dueños.

## Correo Argentino

- `sdd/wip/20261111-correo-argentino-carrier-discovery/`:
  `documented_deferred`. Las fuentes oficiales públicas distinguen MiCorreo
  2025 (cotización/import/tracking) de PAQ.AR API 2.0 2023
  (alta/cancelación/rótulo/tracking/sucursales). No se mezclan contratos ni se
  infieren webhook, GPS o idempotencia remota. Adapter, DDL, credenciales y
  homologación permanecen NO-GO hasta CA-D01..D10, CA-SC01..SC10, onboarding
  comercial, credenciales QA por referencia y doble review Sol.

## Mercado Pago Checkout Pro (WIP separado)

- `sdd/wip/20260922-storecore-mp-live-checkout-v1/`: Checkout Pro externo en la misma ventana mediante Orders API, `documented_deferred`.
- MP-LIVE-01–04 fail-closed cerrados (Sol + dual Grok APPROVED). MP-LIVE-05, pagos reales y fiscal siguen NO-GO.
