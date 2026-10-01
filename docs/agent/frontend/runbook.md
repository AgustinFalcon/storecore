# Frontend runbook

```powershell
cd C:\Users\agustin\Desktop\StoreCore\frontend
npm install
npm run check:architecture
npm run lint
npm run test
npm run build
npm start
```

- UI: `http://localhost:4200`
- Proxy: `/api` → `http://localhost:8080`
- `environment.apiBaseUrl` es `/api/v1`. No hay dominio de cliente.
- Contrato esperado por el UI: `docs/agent/frontend/http-contract.md`.
- El adapter de venta física / POS companion no vive en este frontend.
