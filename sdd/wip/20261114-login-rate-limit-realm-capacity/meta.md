# Capacidad independiente del rate limit por realm

- Estado: `design_review`
- Fecha: 2026-11-14
- Base: `master@0c4d2fe96a4dff29120cb1931e69b13b666d8b0a`
- Issue: #49

## Objetivo

Evitar que la saturación de claves de `CUSTOMER` consuma la capacidad reservada
para `USER`, o viceversa, sin debilitar el límite de intentos ni almacenar email
en claro.
