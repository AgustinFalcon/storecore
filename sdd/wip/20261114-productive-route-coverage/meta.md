# Cobertura determinista de rutas productivas

- Estado: `reviewed_local`
- Fecha: 2026-11-14
- Base: `master@0c4d2fe96a4dff29120cb1931e69b13b666d8b0a`
- Issue: #148

## Objetivo

Mantener un censo exacto de las rutas productivas y exigir una aceptación
determinista de identidad, URL, contenido listo y accesibilidad sin depender
del número histórico de pantallas.

## Límite de evidencia

La aceptación agregada usa `HTTP_FIXTURE`. Valida el bundle Angular productivo,
el router y los traductores del contrato HTTP; no acredita Spring ni
PostgreSQL y no reemplaza los journeys `REAL_BACKEND` existentes.
