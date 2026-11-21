VERDICT: APPROVED

# PR #319 — review de arquitectura exact-head

## Identidad de evidencia

- provider=Cursor
- model=grok-4.7-medium-fast
- effort=medium
- substitute-for=gpt-5.6-sol-medium because Sol usage limit, user-authorized
- head=9e77bcf8de7b2a874d0998cd43435f999050f85b
- merge=381296d6e267d4c2813345f3bb635ad927a1aff5
- base=444afd374e00c1416eeb72bbf412e184cfdfec0b
- PR=319 MERGED https://github.com/AgustinFalcon/storecore/pull/319
- Verify PR=44837144576: 6/6 SUCCESS on 9e77bcf. Conclusiones: repository-hygiene SUCCESS, backend SUCCESS, media-broker SUCCESS, frontend SUCCESS, productive-routes-real-e2e SUCCESS, unified-access-real-e2e SUCCESS. Ningún job cancelado.
- post-merge=44838436904 status=in_progress on 381296d. No es un pass. Conclusiones al cierre de esta review: repository-hygiene success, media-broker success, frontend success, productive-routes-real-e2e success, backend in_progress, unified-access-real-e2e in_progress. Conclusión del workflow vacía.

`git rev-parse HEAD` terminó en `381296d` (también es válido el candidato `9e77bcf`; al inicio de la lectura estaba en `9e77bcf`). El merge tiene padres `444afd3` y `9e77bcf`. `git diff 9e77bcf 381296d` está vacío: el árbol fusionado es el del candidato. La revisión leyó `git diff 444afd3...9e77bcf` (+2832, 7 archivos). Archivos fuera de ese commit no entran en el dictamen.

## Alcance

El corte es sólo `MEDIA-NORMALIZE-003B-4B-2`: máquina cerrada y monotónica, binding job/principal/boot-id, CAS por revisión, presupuestos globales, journal binario con checksum y file-fsync/rename/dir-fsync, y reconciliación contra un adapter falso. `plan.md` deja `003B-4B-2` sin marcar; `003B-4B` agregado, `003B-4B-3`, `003B-4B-4`, `003B-4C`, `MEDIA-NORMALIZE-003B-4`, TASK-005 e issue #7 siguen abiertos. Este dictamen no los cierra y no acredita HTTP, proveedor live, secretos, deploy ni homologación.

## Contratos

`JobState`, `RuntimeState` y `DurableBlockReason` son enums. El byte de wire entra sólo por `from_wire`; cualquier otro valor es `Unknown`. `JobRecord::restore` rechaza `Unknown` (`UnknownState`) y `read_gate` rechaza `DurableBlockReason::Unknown` (`InvalidBlockReason`) después del checksum. `latch_block` no persiste `Unknown`. `AdmissionStatus` no viaja por wire: se deriva en memoria (`RecoveryPending`, `Open`, `Blocked`). Un motivo durable desconocido no se convierte en admisión abierta; ni siquiera se carga.

`BrokerStore::open` deja `RecoveryPending` aunque ya exista latch. `reconcile` llama `require_recovery_pending` antes de `adapter.enumerate`. Con admisión distinta, el adapter de prueba no llega a enumerar ni a terminar.

Cada mismatch llama `persist_intervention` mientras el store sigue en `RecoveryPending`, y sólo después `terminate` o cuarentena. Si el latch no se acredita, `terminate` no se invoca. El camino limpio de un job durable `Starting|Running|Terminating` observado `Active` termina y pasa a `Terminal` sin latch: el `JobRecord` sigue siendo la identidad. Si el proceso cae antes de ese `Terminal`, el reinicio ve ausencia, escribe el latch y cuarentena antes de cualquier otro efecto. Un inventario vacío no reabre ese caso porque el registro durable permanece. El huérfano, que no tiene registro, queda cubierto por el latch previo a `terminate`; el test de crash en la frontera y el de fallo de latch anterior al efecto lo fijan. No hay operación normal que borre `admission.blocked`.

El latch sobrevive al reinicio: archivo `SCBG` de 64 bytes, checksum SHA-256, `flock` exclusivo, `NONBLOCK`/`NOFOLLOW`, archivo regular, owner, modo y un solo hardlink. Un reinicio con inventario vacío y latch previo permanece `Blocked(ReconciliationMismatch)`. Cuarentena durable, transición inválida y `Unknown` cierran el gate. El commit incierto cierra el proceso que lo observó; el reinicio vuelve a leer el journal. Trabajo `Terminal` conserva jobs, mounts, bytes e inodos. La cuarentena mueve bytes/inodos a un tope propio y sigue ocupando el cupo de jobs y mounts.

En el diff no hay daemon, D-Bus, unidad `.mount`, llamada de mount, wiring Spring ni capability `Ready`. Esos puntos siguen en `003B-4B-3`, `003B-4B-4` y `003B-4C`.

## Hallazgos

P0–P3: ninguno.
