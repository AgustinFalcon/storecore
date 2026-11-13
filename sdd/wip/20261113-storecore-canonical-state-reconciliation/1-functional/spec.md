# Especificación funcional

## Problema

La cabecera canónica de `sdd/STATUS.md` todavía presenta `master 7300b8` como
vigente aunque GitHub y el remoto ejecutable ya alcanzaron `master 376790d`.
Esto oculta los cierres de creación real de producto, recovery y hardening de
Origin, y puede hacer que un operador reabra trabajo ya integrado.

## Resultado requerido

- La primera sección de `STATUS` identifica el `master` actual y los cortes
  integrados posteriores a `7300b8`.
- `RELEASE` distingue con claridad core local integrado de activaciones externas.
- `BACKLOG` registra la reconciliación como cerrada sin cambiar el estado de los
  módulos bloqueados o diferidos.
- La evidencia usa SHA, PR y workflow runs verificables; no convierte CI verde
  en homologación.

## Criterios de aceptación

1. `master 376790d` y PR #252 aparecen como vigentes.
2. PR #250/#251 y Verify #654–#659 quedan trazados sin ambigüedad.
3. Fiscal/ARCA, Correo Argentino, Mercado Pago live, StoreCore↔BlackStore live,
   deploy y `release/1.0` siguen explícitamente fuera de alcance.
4. No se modifica código productivo ni se introducen secretos.
