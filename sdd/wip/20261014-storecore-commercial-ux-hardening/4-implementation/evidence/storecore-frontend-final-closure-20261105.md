# StoreCore frontend — cierre local final (2026-11-05)

## Corte certificado

- Base global R8: `0267c78a70a2d2149aa31bb78e47e2af48a18d79`.
- Corte de código final: `982bdc6` (`feat(storecore-frontend): close real content and delivery gates`).
- Alcance: las 26 superficies Demo, la paridad Real permitida por contratos existentes, estados transversales, accesibilidad, rendimiento y packaging reproducible.
- Resultado SDD-kit: `TASK-001..TASK-024 = done`.

## Cierre funcional

- SC16 Real usa `UserContentStore` dedicado, fase cerrada, preview, dirty/discard/save, guard de salida, limpieza por actor/logout y cancelación de respuestas tardías.
- Home, catálogo, PDP, perfil, carrito, checkout, resultado y consola operativa tienen reflow verificado, targets accesibles y contenido demostrable.
- Los estados finitos se traducen en el borde a tipos cerrados con `Unknown`; vistas y stores no convierten strings wire en autoridad de dominio.
- Demo y Real mantienen fronteras honestas: las simulaciones no acreditan pagos, envíos, facturación ni efectos de proveedor.

## Evidencia ejecutable exacta

- `npm run verify`: arquitectura **7/7**, lint PASS, unit/component **936/936**.
- Build Real: **611.81 kB** raw / **136.43 kB** estimado transferido, sin warnings.
- Build Demo optimizado: **1.81 MB** raw / **233.69 kB** estimado transferido, hashing habilitado y presupuesto PASS.
- Demo E2E final: **329/329 PASS**, 15.8 minutos, sin skipped, flaky ni failures.
- Real/a11y Playwright: **46/46 PASS**. La negativa esperada del proxy sin backend conserva un estado honesto y no invalida el gate.
- UX/UI: **26/26** superficies Demo sin violaciones axe a 390 px; **14/14** checks focales de `text-size-adjust: 200%` a 320/390 px sin overflow ni truncado.
- Rendimiento CPU×4: catálogo LCP **896/852 ms**, long task máximo **370/314 ms**, ordenamiento sin long task, CLS 0 y page errors 0.
- La primera corrida Demo completa encontró cuatro fallos reales: dos por el harness optimizado y dos por el primer card SC26 fuera del viewport. Se introdujo `demo-test` no optimizado y se corrigió el layout; el gate completo se repitió hasta 329/329.

## Packaging y seguridad de entrega

- Builds Docker production, demo y runtime PASS.
- `/ping`, fallback SPA y rutas profundas PASS.
- HTML usa `no-store`; bundles hasheados usan `immutable`; assets estables usan `no-cache`.
- Todas las ubicaciones nginx repiten `X-Frame-Options`, `X-Content-Type-Options` y `Referrer-Policy`, evitando la herencia parcial de `add_header`.
- El contenedor estático no inventa un upstream: `/api` permanece detrás del ingress/gateway externo.

## Revisiones independientes

- UI/UX Astra: **APPROVE**, P0–P3 = 0.
- Product Owner Astra: **APPROVE**, P0–P3 = 0.
- Performance/packaging Astra: **APPROVE**, P0–P3 = 0.
- Bug/code Astra: **APPROVE**, P0–P3 = 0.
- Security Astra: halló inicialmente la herencia incompleta de headers nginx; corregida y revalidada: **APPROVE**, P0–P3 = 0.

## Límites no falseados

- Este documento no acredita CI remoto, push, PR, merge ni despliegue.
- Mercado Libre real, Correo Argentino, Mercado Pago/MODO, ARCA y demás proveedores requieren sus credenciales, sandbox/homologación y backend propietario.
- La conclusión certificada es: **frontend StoreCore completo y demostrable en el alcance aprobado; integraciones externas separadas**.
