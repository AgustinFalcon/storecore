# Carriles de homologación StoreCore vs companion

Issue [#106](https://github.com/AgustinFalcon/storecore/issues/106).

## Carril A — dossier de homologación del core

Paquete presentable: `master` (o una promoción posterior **solo** del comercio web). Alcance: las 22 rutas existentes contra el API real, cookie + proxy, `BLACKSTORE_INTEGRATION=DISABLED`. No se reclama mostrador, companion live, fiscal, MP-LIVE-05 ni dispatcher ML.

## Carril B — evidencia SDD del companion

Sigue en `integration/storecore-int` y en el repo BlackStore: POSC, DSP, loopback, issues, reviews. **No se borra.** No entra al dossier A. Un loopback efímero posterior es otro issue, fail-closed, sin browser StoreCore.

Borrar el registro del carril B no limpia la homologación: la limpia el **alcance** del dossier A y el módulo apagado.

La base local `storecore-postgres` puede tener checksums Flyway viejos (V4/V5). El walk FE↔BE usa un Postgres 16 efímero (`storecore-homolog-pg` en `:5434`), no `flyway repair` sobre el volumen sucio. `storecore-postgres` se deja parado para no perder datos viejos. No se arranca el Postgres de BlackStore.

Flyway no inserta `installation_settings`: el guard exige exactamente una fila `installation_id=1` (provisioning, no migración). En el walk local: `INSERT INTO installation_settings(installation_id, business_name, allowed_host, currency) VALUES (1, 'Homologacion local', 'localhost', 'ARS')`. El primer USER ADMIN sigue siendo `bootstrap-admin` por TTY; no hay alta HTTP de USER.
