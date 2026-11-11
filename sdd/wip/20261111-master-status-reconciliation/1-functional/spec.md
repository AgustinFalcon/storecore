# Especificación funcional

Como equipo de entrega necesito que el estado canónico identifique el último
`master` validado, para que el siguiente incremento parta de evidencia vigente.

## Criterios

- Registrar PR #240/#241 y el SHA integrado de `master`.
- Registrar reviews y CI de PR y post-merge sin heredar evidencia entre SHAs.
- Mantener explícitos los bloqueos de proveedores, fiscal, carrier, companion y
  release.
- No cambiar comportamiento ejecutable.
