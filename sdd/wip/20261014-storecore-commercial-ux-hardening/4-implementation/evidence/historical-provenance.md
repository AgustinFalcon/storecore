# Procedencia de evidencia histórica

Este manifiesto evita atribuir a `master` o al PR #195 resultados obtenidos en un
árbol de integración que luego fue dividido. El PR #195 sólo promueve contratos,
planes y evidencia como contexto; no promueve el código al que se refieren los
resultados siguientes.

| Evidencia | Fuente recuperable | Estado en PR #195 | Uso permitido |
| --- | --- | --- | --- |
| `real-sc16-sc19-cut-20261016.md` | `UNKNOWN/UNVERIFIED` | Histórica, no aplicable | Orientar el corte propietario y repetir gates |
| `real-sc17-catalog-cut-20261016.md` | `UNKNOWN/UNVERIFIED` | Histórica, no aplicable | Orientar el corte propietario y repetir gates |
| `real-sc21a-order-operations-cut-20261016.md` | `UNKNOWN/UNVERIFIED` | Histórica, no aplicable | Orientar el corte propietario y repetir gates |
| `real-sc22-inventory-cut-20261016.md` | `UNKNOWN/UNVERIFIED` | Histórica, no aplicable | Orientar el corte propietario y repetir gates |
| `real-sc23-mercadolibre-mapping-cut-20261016.md` | `UNKNOWN/UNVERIFIED` | Histórica, no aplicable | Orientar el corte propietario y repetir gates |
| `real-sc24-capabilities-cut-20261016.md` | `UNKNOWN/UNVERIFIED` | Histórica, no aplicable | Orientar el corte propietario y repetir gates |
| `real-sc25-profile-import-cut-20261019.md` | `UNKNOWN/UNVERIFIED` | Histórica, no aplicable | Orientar el corte propietario y repetir gates |
| `demo-sc26-customer-administration-cut-20261019.md` | `UNKNOWN/UNVERIFIED` | Histórica, superseded | No certificar la promoción SC26; usar el corte ejecutado 20261027 |

No se inventa un SHA para completar la trazabilidad. Cada PR de código debe
publicar: SHA final, base, archivos, entorno, comandos, fixtures, resultados,
artefactos y veredictos de revisión ejecutados nuevamente. Sólo esa evidencia
puede actualizar tareas y gates vigentes desde `pending/NOT_RUN`.
