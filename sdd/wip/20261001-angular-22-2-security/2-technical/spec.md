# Especificación técnica

- Alinear paquetes Angular directos, CLI y build en `22.2.1`.
- Regenerar `package-lock.json` a partir del manifest revisado.
- Retirar `@angular/animations`: no tiene imports ni configuración en `frontend/src` y está deprecado.
- No actualizar majors de ESLint, TypeScript, Vitest, jsdom, NgRx o Zone.js en este corte.
- No usar `npm audit fix`; la resolución permanece explícita y revisable.
