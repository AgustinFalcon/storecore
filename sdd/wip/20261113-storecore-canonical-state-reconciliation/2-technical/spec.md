# Especificación técnica

## Fuentes de verdad

- Git `origin/master`: `376790ddc184091551832ff9b2d5b776747794b7`.
- PR #250: recovery delivery, merge `5ba014f`, Verify #654/#655.
- PR #251: cierre documental recovery delivery, merge `99ac6b2`, Verify #656/#657.
- PR #252: hardening de Origin unificado, squash/merge `376790d`, Verify
  #658 `43312967237` y post-merge #659 `43313975226`.

## Invariantes

- El cambio es exclusivamente Markdown.
- Los estados de backlog existentes no se reinterpretan.
- Un proveedor externo sólo puede pasar de blocked/deferred mediante su propio
  SDD, credenciales por referencia, aceptación y homologación.
- Las referencias históricas permanecen como historia y la nueva cabecera las
  precede como estado canónico vigente.

## Verificación

- `git diff --check`.
- Comparación exacta contra `origin/master`.
- Dos reviews GPT-6.1 Sol independientes antes del PR.
- Verify del PR y post-merge obligatorio.
