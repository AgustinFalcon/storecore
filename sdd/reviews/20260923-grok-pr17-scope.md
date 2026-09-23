VERDICT: CHANGES_REQUIRED

# Grok review B — PR #17 scope + safety

**Fecha:** 2026-09-23  
**PR:** https://github.com/AgustinFalcon/storecore/pull/17  
**Head:** `docs/pos-fiscal-proposals` @ `04be517`  
**Diff revisado:** `git diff origin/master...HEAD` (`origin/master` @ `3eb8183`)  
**Lane:** alcance y seguridad. No es un implementation GO. No merge.

## Cambio requerido

Retarget del base de GitHub antes de cualquier merge. `gh pr view 17` declara `baseRefName=feature/storecore-core-v1.0.0` (`e996872`), no `master`. Ese compare de GitHub son 11 commits e incluye código ya integrado en master (Flyway `V4__mp_orders_checkout.sql`, controllers/endpoints de Orders, `InstallationSecretLookup.kt`). Mergear el PR tal como está no aterriza documentación en `master` y no es un diff docs-only.

El rango `origin/master...HEAD` sí es el carril documental de Sol (2 commits: `668f969`, `04be517`). Tras retarget a `master`, ese rango no necesita otro cambio de contenido para este lane.

## Chequeos del rango contra `origin/master`

| Chequeo | Resultado |
|---|---|
| Archivos | 14 paths, todos bajo `sdd/`. +260 / −46. Cero `.kt`, `.sql`, Flyway, `application.yml`, frontend o workflow. |
| Addendum fiscal | `documented_deferred`. D-01, D-07, SC-02, SC-03 y SC-07 siguen **Open**. El cierre exige además D-02..D-06, SC-01, SC-04..SC-06, titular/contador y GO Sol. No autoriza código, DDL, worker, secretos, homologación ni emisión. |
| Implementación POS | Sigue bloqueada. `meta.md` (sin cambio) conserva `implementation: blocked_by_sol_gate` y `ready_for_sol_review` (not approved). `tasks.json`: `done: 0`, 13 tareas `pending`, incluida `TASK-PIC-010`. ADR-007/008: `proposed for Sol`. OpenAPI permanece `1.0.0-draft`; `x-approval-gate.consequence` niega ports, DTOs, fixtures, Flyway, endpoints y runtime hasta un GO separado. |
| EffectivePrice | No hay `EffectivePrice*.kt` en el diff. El nombre aparece sólo en el gate Sol, que los deja untracked y fuera del commit. |
| `BLACKSTORE_INTEGRATION` | No hay módulo, adapter, endpoint ni capability aplicada. El SQL del data-model es diseño no ejecutable, ya etiquetado “no aplicar Flyway”. El INSERT sigue `future_optional=true` y `DISABLED`. ADR-008 dice que no autoriza ejecutar V4/V5/V6 ni activar el módulo. |
| Secretos / activación | Sin credenciales, certificados ni tokens. Sin deploy, tag o publish. V6 queda como tarea documental `pending`. |

## Alcance permitido

Coincide con `AGENTS.md` y con `sdd/reviews/20260923-sol-next-work-go.md` (`CONDITIONAL_GO` sólo documental): single-tenant, USER distinto de CUSTOMER, POS y fiscal sin adapter/DDL/emisión, MP-LIVE-05 sin activar. El cuerpo del PR describe ese carril. La reconciliación Sol (purge único tombstone → líneas → saga, `OPERATION_STATE_CONFLICT`, `AC-STK-8`, ownership V4/V5/V6 en PIC-010) permanece en specs, OpenAPI y tasks, sin marcar tareas done ni approved.

## Validación

- `git diff --name-status origin/master...HEAD`: sólo markdown, OpenAPI de contrato y `tasks.json`.
- Búsqueda en ese diff: `EffectivePrice` sólo en prosa del gate; sin archivos de código ni migración.
- `tasks.json`: ningún `"status"` distinto de `pending` / `ready_for_sol_review`.
- OpenAPI en HEAD: `version: 1.0.0-draft`.
