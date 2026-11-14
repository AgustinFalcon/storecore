# Spec técnico — matriz productiva real

## Censo y bindings

Separar la definición canónica de ruta de sus bindings de evidencia. La
definición conserva patrón, `SurfaceIdentity`, actor y requisito; cada binding
`HTTP_FIXTURE` o `REAL_BACKEND` resuelve URL, heading y readiness para su fuente.
El binding real consume un `RealFixtureReceipt` validado con IDs, SKUs y
escenarios creados por la preparación. No asume IDs secuenciales ni cambia el
modo de evidencia globalmente.

Los conjuntos finitos son tipos cerrados con `Unknown`: actor, escenario, clase
de acción, fuente de evidencia (`HTTP_FIXTURE`, `REAL_BACKEND`,
`REAL_BACKEND_LOCAL_PROVIDER`) y resultado del gate. Se reutilizan
`AccessContext`, `UserRole`, `SurfaceIdentity`, delivery y capabilities. Vistas,
stores y tests no comparan wires mágicos.

Un test de arquitectura reconcilia recursivamente `Routes` con definiciones,
bindings HTTP y bindings reales. Rechaza leaves, redirects o wildcards faltantes,
duplicados o huérfanos, `loadChildren` no soportado y cualquier `Unknown`.

## Preparación real

El bootstrap SQL se limita a instalación e identidades sintéticas sobre una base
PostgreSQL 16 vacía y descartable. El dominio se prepara por APIs reales mediante
pasos con una sola responsabilidad:

1. preflight y migraciones vigentes;
2. identidades separadas y roles;
3. seguridad de integraciones externas;
4. política manual de entrega;
5. contenido, marca, catálogo y stock;
6. customer, dirección y favoritos;
7. orden pendiente coherente y carrito poblado independiente;
8. escenarios de operación y receipt final;
9. verificación y replay.

El checkout lee el carrito después de agregar sus líneas y envía
`cartRevision`, `addressRevision`, modo y versión de configuración autoritativos.
El runner configura explícitamente una política V22 válida antes de activar
`MANUAL_FULFILLMENT`.

El fixture se ejecuta dos veces. Debe preservar identidades, una sola orden,
balances, ledger, ediciones y datos ajenos. No restaura stock ni pisa cambios del
operador. Cada journey mutable usa entidades propias y no depende del orden entre
specs. Playwright usa un worker y cero retries inicialmente.

## Red y entorno fail-closed

- Los procesos hijos reciben un entorno construido por allowlist, no
  `...process.env` indiscriminado.
- Se fijan Mercado Pago `unconfigured`, delivery de identidad `UNCONFIGURED`,
  workers externos apagados y capabilities externas `DISABLED` antes y después.
- La matriz no usa `page.route`, `route.fetch`, `route.fulfill` ni simuladores de
  proveedores.
- El transporte de Spring/JVM, Node y Chromium permite sólo loopback y debe
  bloquear hostname, IP y WebSocket externos con self-tests por proceso. Si la
  plataforma no puede aplicar el aislamiento, el gate falla.
- El filtro DNS de Chromium es defensa adicional, no la única barrera.

## Sesiones y ejecución

Crear contextos independientes para anónimo, CUSTOMER dueño, CUSTOMER ajeno,
ADMIN y OPERATOR. Los logins son reales; se verifican cookies y 401 del realm
opuesto. El recorrido de lectura usa un seed inmutable. Acciones y negativos
viven en journeys separados con sus propios principals/datos.

El alta válida crea un CUSTOMER único desde Angular, confirma la identidad con
un login posterior y verifica que no obtiene autoridad USER. No se persisten sus
credenciales como artefacto.

La matriz estricta conserva pagos externos desconfigurados: acredita pedido
pendiente y rechazo de fulfillment. El journey ya aislado que necesita una
acreditación durable se clasifica `REAL_BACKEND_LOCAL_PROVIDER`, ejecuta el
proveedor oficial local controlado sobre el mismo SHA y no se suma al conteo de
casos sin simulación ni a una homologación externa.

Cada aceptación espera las respuestas reales que alimentan la pantalla, valida
URL final, superficie, heading y readiness vinculada al receipt, y recién después
ejecuta Axe/reflow. Redirects y wildcards tienen casos propios. La suite
`HTTP_FIXTURE` conserva sus negativos de wire/red y agrega la aserción de URL que
su spec ya promete; no se presenta como backend real.

## CI y artefactos

Agregar un job independiente `productive-routes-real-e2e` con PostgreSQL 16
nuevo. No comparte el esquema ya usado por UA/recovery. Secuencia:

1. higiene y build exactos del SHA;
2. migraciones y package backend;
3. build Angular productivo;
4. arquitectura, typecheck, lint y discovery de la matriz;
5. runtime real;
6. JUnit/HTML, censo, acciones, Axe/reflow y logs redactados.

La ausencia de artefactos requeridos falla; no se usa `if-no-files-found: ignore`.
Nunca se publican cookies, CSRF, TLS privadas, hashes ni cuerpos con tokens.

## Gates

- Verificación frontend completa y tests focales de traductores/censo.
- Tests del loader, preparación inicial/replay y migraciones V1→vigente.
- Runtime real estricto 90/90 más redirects/wildcards y journeys de acciones;
  las acciones con proveedor local se reportan por separado.
- Self-tests de egress y comprobación external-safety antes/después.
- Reviews producto/UX y técnica/seguridad sobre diff exacto.
- Verify del PR y Verify post-merge sobre el SHA fusionado.

## No cambios facilitadores

No agregar migraciones productivas, endpoints o autoridad de dominio sólo para
facilitar el test. Un defecto descubierto se corrige en su capa y se sincroniza
con esta spec; una capacidad externa no homologada conserva su estado seguro.
