VERDICT: APPROVED

# Grok review B — PR #17 scope + safety (second pass)

**Fecha:** 2026-09-23  
**PR:** https://github.com/AgustinFalcon/storecore/pull/17  
**Título:** Propose POS ADR-007/008 and fiscal addendum (docs only)  
**Head:** `docs/pos-fiscal-proposals` @ `2c992d7`  
**Base GitHub:** `master` (`gh pr view 17`: `baseRefName=master`, `headRefName=docs/pos-fiscal-proposals`)  
**Diff revisado:** `git diff origin/master...HEAD` (`origin/master` @ `3eb8183`; commits `668f969`, `04be517`, `2c992d7`)  
**Lane:** alcance y seguridad. No es un implementation GO. No merge.

## Cierre del CHANGES_REQUIRED anterior

El primer pase (`sdd/reviews/20260923-grok-pr17-scope.md`, head `04be517`) pedía retarget: la base era `feature/storecore-core-v1.0.0`. Ahora `baseRefName=master`. El listado de archivos de GitHub coincide con `git diff --name-status origin/master...HEAD`: 16 paths, todos bajo `sdd/`. Cero `.kt`, `.sql` Flyway, frontend o workflow.

`2c992d7` es reconciliación documental del CHANGES_REQUIRED de contrato (un solo orden de lock, `OPERATION_STATE_CONFLICT` separado del CONFLICT reintentable, ownership V4/V5/V6 en el SQL de diseño). Ese contenido está permitido. No abre implementación.

## Chequeos

| Chequeo | Resultado |
|---|---|
| Base y archivos | `baseRefName=master`. 16 archivos GitHub = 16 del rango contra `origin/master`. +382 / −62. Sólo markdown, OpenAPI contractual y `tasks.json`. |
| Addendum fiscal | Sigue `documented_deferred`. D-01, D-07, SC-02, SC-03 y SC-07 siguen **Open**. El cierre sigue exigiendo D-02..D-06, SC-01, SC-04..SC-06, titular/contador y GO Sol. STATUS lo deja como propuesta Open, sin código, DDL, worker ni secretos. |
| Implementación POS | Sigue bloqueada. `meta.md` no está en el diff y conserva `implementation: blocked_by_sol_gate` y `ready_for_sol_review` (not approved). ADR-007/008: `proposed for Sol`. OpenAPI `1.0.0-draft`. `x-approval-gate.consequence` niega ports, DTOs, fixtures, Flyway, endpoints y runtime hasta un GO separado. |
| `tasks.json` | `done: 0`, `total: 13`. Las 13 tareas están `pending`, incluida `TASK-PIC-010`. El status del archivo sigue `ready_for_sol_review`, no approved. |
| EffectivePrice | No hay `EffectivePrice*.kt` en el diff ni en los tres commits. Siguen untracked en el working tree y fuera del PR. |
| `BLACKSTORE_INTEGRATION` | No hay módulo, adapter, endpoint ni capability aplicada. El SQL vive en `data-model-v1.md` como diseño no ejecutable (“No aplicar Flyway”). El INSERT sigue `future_optional=true` y `DISABLED`. ADR-008 dice que no autoriza ejecutar V4/V5/V6. V6/`TASK-PIC-010` es documental y `pending`. |
| Secretos / activación | Sin credenciales, certificados ni tokens. Sin deploy, tag o publish. Sin tenancy SaaS, `store_id` ni mezcla USER/CUSTOMER. MP-LIVE-05 no se activa. |

## Alcance

Coincide con `AGENTS.md` y con `sdd/reviews/20260923-sol-next-work-go.md`: el único carril abierto es documental. El `CONDITIONAL_GO` de ese gate no es un GO de implementación. Este veredicto tampoco lo es.
