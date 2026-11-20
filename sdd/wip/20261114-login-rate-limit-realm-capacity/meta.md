# Capacidad independiente del rate limit por realm

- Estado: `delivered`
- Fecha: 2026-11-14
- Base: `master@0c4d2fe96a4dff29120cb1931e69b13b666d8b0a`
- Issue: #49
- PR: #275
- Merge: `86d01ac562b73c97678fa5999457c1a00b014fc0`

## Objetivo

Evitar que la saturación de claves de `CUSTOMER` consuma la capacidad reservada
para `USER`, o viceversa, sin debilitar el límite de intentos ni almacenar email
en claro.
