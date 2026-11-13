# Evidencia — baseline ARCA externa

## Fuente exacta

- Remote: `https://github.com/AgustinFalcon/arca-facturacion.git`
- `master`: `8efeace434103e94f69ad1bce94a9d6dfe2cf7ec`
- Versión Gradle: `0.1.0-RC.4`

## Gates técnicos observados

- 22 suites, 78 pruebas, 0 fallos y 0 errores.
- Cobertura agregada 89,03 % (1128/1267 líneas).
- SBOM CycloneDX generado.
- Todos los módulos publicados a Maven local, incluido `async-reference`.
- Smoke Maven consumidor: 1 prueba, 0 fallos.
- Verify post-merge `43366597624`: `success`.
- Security post-merge `43366597599`: `success`.

## Límite de la evidencia

La evidencia acredita el candidato de biblioteca y sus contratos locales. No
acredita paquete remoto, tag, emisor, matriz fiscal, credenciales, homologación,
adapter StoreCore, comprobante real ni producción. El job DEBUG self-hosted sin
runner fue cancelado y no se presenta como gate aprobado.

## Regresión StoreCore sobre `master`

Ejecución local del 13 de noviembre de 2026, sobre el baseline
`e9986c8850d58bc0eb6526c2dab4c9d21a10ffe7`:

- Backend: `mvn -B test` — 399 pruebas, 0 fallos, 0 errores, 0 omitidas;
  `BUILD SUCCESS`.
- Frontend: `npm run verify` — arquitectura y lint aprobados, 186 archivos de
  prueba y 1225 pruebas aprobadas, más build Angular productivo aprobado.

Estos gates prueban que la documentación de readiness no altera el baseline de
StoreCore. No sustituyen el adapter ARCA, sus pruebas contractuales ni la
homologación fiscal externa.
