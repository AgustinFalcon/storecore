# Catalog option schema PDP

StoreCore ahora modela las opciones de un producto mediante un schema cerrado,
versionado y genérico. El mismo contrato soporta herramientas, indumentaria y
futuros rubros sin introducir claves comerciales mágicas en la vista.

## Entregado

- dominio cerrado Kotlin/TypeScript con traducción wire única y `Unknown`
  fail-closed;
- persistencia PostgreSQL V24–V26 con invariantes diferibles, ownership y
  privilegios mínimos de runtime;
- writer administrativo CAS, autorización por capacidad, CSRF y auditoría;
- proyecciones pública/admin y búsqueda paginada sin N+1;
- selección determinista, Select/Swatch accesibles y compra derivada de una
  única variante autoritativa;
- editor ADMIN con conflicto 409, diff y reaplicación explícita;
- pruebas de integridad, concurrencia, límites, comprador y administrador.

## Estado final

PR #284 integrado en `master` con merge commit
`edb769067d720fc8e9f80cf2a8b53c6b328b123b`. Las revisiones exact-head no
dejaron P0–P3 y los CI pre-merge y post-merge finalizaron 4/4 en verde.

Las homologaciones externas de Mercado Pago, ARCA, Mercado Libre y Correo
Argentino no forman parte de este feature.
