# Spec UI — TASK-012 y límites

## Import de perfil `/user/profile-import`

- Preview: `POST /api/v1/user/profiles/preview` con manifiesto versionado.
- Merge explícito: `POST /api/v1/user/profiles/merge`.
- La UI muestra diff y compatibilidad core 1.x. Redacta secretos del diff.
- Manifiesto con `secret|password|token|apiKey|credential` se rechaza en el use case.
- Incompatible = error cerrado. Merge deshabilitado. No reescribe histórico.

## Fuera de este frontend

- Adapter BlackStore y `/blackstore-integration/v1`.
- Fiscal / ARCA.
- Live vendor HTTP (credenciales MP/ML). TODO-041 worker+fake está in-repo; la UI U-07/U-08 sigue read-only + mapping.
- Marketplace, feature flags, `store_id`.
- Prototype fixture. Si aparece, build `storefront-prototype` y banner DEMO.
