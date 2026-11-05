# SC25 Real — importación segura de perfil
> **Procedencia:** evidencia histórica de un árbol de integración previo al split. El
> SHA exacto no es recuperable (`UNKNOWN/UNVERIFIED`); por tanto, estos resultados
> no certifican el PR #195 ni `master`. Consultar `historical-provenance.md` y
> repetir todos los gates sobre el SHA dueño antes de promover el corte.

Fecha: 2026-10-19
Alcance: `/user/profile-import`, contrato exacto de perfil y paridad segura del simulador Demo.

## Resultado implementado

- Workbench profesional de dos pasos: editor técnico con ayuda de esquema, resultado compatible, métricas de impacto, diff por sección y selección explícita.
- Alcance honesto: sólo `content.homeSections`; no se prometen cambios sobre identidad, permisos, pedidos, integraciones, configuración ni históricos.
- El borde valida nombre, versión, compatibilidad, claves exactas, tipos escalares, claves únicas, selección, 200 secciones, 20 KB por contenido y 1 MB de manifiesto.
- `ProfileDiffKind`, `ProfileImportPhase` y `ProfileDiffOperation` son tipos cerrados; operaciones wire desconocidas permanecen `Unknown` y bloquean la aplicación.
- Preview, selección y merge quedan ligados al texto exacto. Un error de merge invalida la autorización anterior y exige una vista previa nueva, evitando reintentos ambiguos.
- La escritura permanece detrás de confirmación contextual. Las solicitudes repetidas se serializan, el cambio de actor cancela y limpia, y el guard protege navegación/recarga con una decisión compartida incluso frente a intentos consecutivos.
- Backend rechaza coerción de `sectionKey`, `active` y `sortOrder`, claves extra y nombres sensibles; merge, import record y auditoría continúan atómicos.
- Demo aplica la misma frontera de forma cerrada, no conserva campos extra ni secretos en el snapshot y recupera el estado visual luego de una validación exitosa.
- Reflow verificado a 390/768/1440, incluyendo una clave válida de 80 caracteres; nombres accesibles distinguen cada selector y los paneles JSON son alcanzables por teclado.

## Evidencia automatizada

- Arquitectura: **6/6 PASS**, `Container → View → Store → UseCase → HTTP repository`.
- ESLint completo: **PASS**.
- Unitarias frontend completas: **141 archivos / 622 tests PASS**.
- Build producción: **PASS**, `729.79 kB` raw / `158.56 kB` estimado para main; `748.51 kB / 162.02 kB` total inicial.
- Browser Chromium SC25: **7/7 PASS**: confirmación, reintento seguro, operación desconocida, descarte de navegación, nombres accesibles distintos y reflow 390/768/1440 con Axe sin violaciones serious/critical ni overflow horizontal.
- Integración PostgreSQL 16/Testcontainers: **6/6 PASS**, incluido límite 200/201, tipos inválidos, rechazo de secretos, atomicidad y auditoría.
- Docker Desktop fue iniciado sólo para Testcontainers y detenido al terminar.

## Reviews coordinadas Astra

- Primera ronda: Bugbot, Security y UX/Product solicitaron cambios por autorización reutilizable tras fallo, descarte concurrente, paridad de límites, contrato Demo, nombres accesibles y estados visuales.
- Segunda ronda: detectó coerción backend de `sectionKey` y overflow de clave máxima; ambos bordes se corrigieron y sus regresiones quedaron automatizadas.
- Veredicto final coordinado: **Bugbot APPROVE, Security APPROVE, UX/Product APPROVE; 0 P1/P2**.

## Límites explícitos

- No se implementan settings, export ni reset dentro de la superficie Real SC25.
- No se importan datos fuera de `homeSections` y no se aceptan alias legacy del contrato.
- Stitch SC25 permanece como gate separado hasta una evidencia visual externa nueva; las capturas Playwright acreditan la implementación local, no una aprobación Stitch.
- No se creó commit, PR, merge ni publicación.
