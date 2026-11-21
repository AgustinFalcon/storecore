VERDICT: APPROVED

# PR #321 — review de seguridad, re-review del SHA nuevo

## Identidad de evidencia

- provider=Cursor
- model=grok-4.7-medium-fast
- effort=medium
- substitute-for=gpt-5.6-sol-medium because Sol usage limit, user-authorized
- lane=security
- head=439d204ec2dff101addacf97df90a6b0895b2679
- base=3027f9aec78e65c4bc4f388b181884b9a572c492
- PR=321 MERGED https://github.com/AgustinFalcon/storecore/pull/321
- merge=74152810031ec820dc52cd43bf8a4ef1120abec3
- Verify=44841759076 6/6 SUCCESS on 439d204. Jobs: repository-hygiene, backend, media-broker, frontend, productive-routes-real-e2e, unified-access-real-e2e. Los seis `completed`/`success`. Ninguno cancelado.
- re-review after SHA moved from fb22a97. El APPROVED anterior de `fb22a97` no se hereda. Este dictamen lee el árbol de `439d204`.

`git rev-parse HEAD` = `439d204ec2dff101addacf97df90a6b0895b2679`. `git rev-parse origin/master` = `3027f9aec78e65c4bc4f388b181884b9a572c492`.

## Lectura previa al dictamen

Título y cuerpo de #321: persistir las dos APPROVED Grok 4.7 de #319 sobre `9e77bcf`, reemplazar el claim inexacto de tres reviews GPT-6.1 Sol que #322 dejó en `master`, marcar `003B-4B-2` sólo con el post-merge `44838436904` 6/6, y dejar abiertos `003B-4B-3+` sin daemon, mounts, D-Bus, Spring, `Ready`, secretos ni deploy.

`sdd/STATUS.md`, `plan.md` de `003B-4B-2`, `progress.md`, `meta.md` y `AGENTS.md`. La guía sigue prohibiendo desplegar, usar secretos, taggear y publicar. Este diff no lo hace.

`git diff origin/master...HEAD`: 6 archivos, +126/−23, todos Markdown de SDD.

- `sdd/STATUS.md`
- `sdd/reviews/20261120-sol-pr319-architecture.md`
- `sdd/reviews/20261120-sol-pr319-security.md`
- `sdd/wip/20261116-catalog-media-upload-and-variant-gallery/3-tasks/plan.md`
- `sdd/wip/20261116-catalog-media-upload-and-variant-gallery/4-implementation/progress.md`
- `sdd/wip/20261116-catalog-media-upload-and-variant-gallery/meta.md`

No hay runtime, workflow, lockfile, migración, credencial, token ni secreto.

## Evidencia que este SHA corrige

En `origin/master` (`3027f9a`, #322) el plan de `003B-4B-2` decía «tres reviews exact-head independientes» y `progress.md` atribuía el cierre a «tres reviews independientes GPT-6.1 Sol». Este SHA borra esas dos frases. El plan queda en dos reviews Grok 4.7, sustituto autorizado por cupo agotado. El cierre de `progress.md` dice explícitamente que no hubo tres reviews GPT-6.1 Sol de `9e77bcf`. `STATUS.md` repite las dos Grok 4.7 y no reinstala el claim de Sol.

Las notas persistidas de #319 abren con `VERDICT: APPROVED`. Identifican Cursor / `grok-4.7-medium-fast` / medium y el sustituto autorizado de `gpt-5.6-sol-medium`. Citan head `9e77bcf8de7b2a874d0998cd43435f999050f85b`, merge `381296d6e267d4c2813345f3bb635ad927a1aff5` y Verify `44837144576` 6/6. Dejan `44838436904` en `in_progress` porque así estaba cuando se escribieron. No se reescriben para fingir que ya habían visto el 6/6.

El checkbox `[x] 003B-4B-2` cita ese post-merge como terminado 6/6. `gh run view 44838436904`: `conclusion=success`, `status=completed`, `event=push`, `headSha=381296d6e267d4c2813345f3bb635ad927a1aff5`, seis jobs success, ninguno cancelado. El título de `progress.md` coincide: «003B-4B-2 cerrado: Grok 4.7 APPROVED y post-merge 6/6». El cuerpo publicado de #321 describe ese cierre y ya no dice que 4B-2 sigue sin marcar.

Siguen sin marcar `003B-4B-3`, `003B-4B-4`, el agregado `003B-4B`, `003B-4C` y `MEDIA-NORMALIZE-004`. `meta.md` integra sólo hasta `003B-4B-2` y exige los gates propios antes de `003B-4`, TASK-005 o #7. No hay `Ready`, daemon, mounts, D-Bus, wiring Spring, HTTP live, secreto, deploy, tag ni publish.

## Hallazgos

P0: ninguno.

P1: ninguno.

P2: ninguno.

P3: ninguno.

## Residuales (no son hallazgos)

Las menciones históricas de «tres reviews» en `progress.md` pertenecen a candidatos anteriores de 4B-1/4B-2 que fueron rechazados o que seguían abiertos. No acreditan `9e77bcf`. Daemon, mounts, D-Bus, Spring y `Ready` siguen fuera de este corte. Este dictamen no mergea.
