# StoreCore frontend

Angular 22. Clean architecture como AssistTime `release/1.4` empleados:

`Component → Store → UseCase → IRepository → HTTP`

Requires Node `>=20.19.0` or `>=22.12.0`. Production binds HTTP repositories only.

## Commands

```powershell
cd frontend
npm install
npm run check:architecture
npm run lint
npm run test
npm run build
npm start
```

UI en `http://localhost:4200`. `/api` proxea a `http://localhost:8080`.
