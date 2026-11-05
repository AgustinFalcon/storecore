# Checkpoint SDD-kit — FE-COMP-02

Fecha: 2026-10-14
Estado: `BLOCKED_TOOLING` para el validador automático; revisión manual de alcance continuada.

## Comando intentado

```text
bash ~/.sdd-kit/tools/validation/validate-spec-conflicts.sh \
  sdd/wip/20261009-frontend-product-completion advisory --json
```

## Resultado reproducible

El comando no alcanza a inspeccionar los specs. El script de SDD-kit intenta cargar
`tools/shared/validator-utils.sh`; ese archivo no está presente en la instalación.
Git Bash además reporta un BOM en el shebang. No se reemplazó ni modificó la
instalación global del usuario desde este feature.

## Revisión manual equivalente limitada

- El contrato de `variantId` sigue siendo identidad abierta de catálogo, no un
  enum de interfaz; los estados de UI continúan representados por tipos cerrados.
- La cotización se modela por línea `(sku, variantId)` y no se infiere desde el
  texto de la variante.
- Un cambio de precio o disponibilidad requiere reconfirmación antes de checkout.
- Snapshots anteriores a v3 se rechazan con una acción de restablecimiento
  explícita; no hay migración silenciosa.

Esto no sustituye G-D ni un `/sdd.check --sync`. Cuando se repare o complete la
instalación de SDD-kit, reejecutar el validador antes de promover FE-COMP-02.
