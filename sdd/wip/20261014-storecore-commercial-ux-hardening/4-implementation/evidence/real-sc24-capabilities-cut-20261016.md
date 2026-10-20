# SC24 Real — módulos del comercio

Fecha: 2026-10-16
Alcance: `/user/capabilities`, lectura de configuración, comando productivo existente y reconciliación.

## Resultado implementado

- Experiencia profesional basada en fichas: búsqueda, filtro cerrado, conteo, tres ejes separados y reflow 390/768/1440.
- Las siete fichas aprobadas muestran estado operativo, disponibilidad y nivel de entrega sin equiparar `ACTIVE` con integración u homologación.
- Los módulos productivos adicionales informados por backend no se eliminan: conservan su estado autoritativo y muestran metadata no clasificada como `Unknown`.
- Módulos sin ID productivo son informativos, no ofrecen comandos ni inventan rutas. Los propietarios existentes enlazan sólo a rutas reales.
- Operator conserva lectura limpia; sólo Admin puede preparar un cambio contextual con estado, motivo y versión vigente, seguido por confirmación explícita.
- UUID se crea una vez por intento. POST, consulta del mismo comando y lista fresca se reconcilian sin éxito optimista ni reenvío automático.
- Timeout, conflicto e incertidumbre quedan separados. La recuperación consulta el mismo UUID y jamás repite POST.
- Conflicto conserva módulo, destino, motivo y contexto; “Revisar la propuesta” rehidrata el editor contra la versión fresca.
- Actualización general y reconciliación son mutuamente excluyentes en UI y store, evitando que una lectura vieja reemplace un resultado confirmado.
- Navegación y recarga quedan bloqueadas mientras el comando está en curso; cambio de actor cancela, limpia y libera el guard.
- Tres diálogos cubren información, confirmación y resultado incierto con Escape, foco y teclado.

## Evidencia automatizada

- Arquitectura: **6/6 PASS** (`Container → View → Store → UseCase → HTTP repository`).
- ESLint completo: **PASS**.
- Unitarias completas: **141 archivos / 616 tests PASS**.
- Focalizadas finales SC24: **6 archivos / 45 tests PASS**.
- Build producción final: **PASS**, `717.82 kB` raw / `156.50 kB` transferencia estimada para main; `736.54 kB / 159.96 kB` total inicial.
- Browser Chromium final: **4/4 PASS**: recorrido Admin a `390 / 768 / 1440` y recuperación incierta con el mismo UUID; Axe sin violaciones serious/critical, sin overflow y sin segundo POST.
- El servidor Angular temporal y Chromium finalizaron al cerrar cada suite.

## Reviews coordinadas Astra

- Bugbot: **APPROVE**, 0 P1/P2.
- Security: **APPROVE**, 0 P1/P2.
- UX/Product: **APPROVE**, 0 P1/P2.
- Los P3 de filtro al restaurar propuesta, metadata desconocida, copy y densidad móvil fueron corregidos y el browser volvió a pasar 4/4.

## Límites explícitos

- Disponibilidad y entrega son metadata de presentación, no campos del backend ni promesas contractuales.
- No se crean IDs, rutas, licencias, homologaciones ni integraciones externas inexistentes.
- La aprobación corresponde a la implementación Real provisional. Stitch SC24 continúa `CHANGES_REQUESTED`; no habilita todavía PR o merge.
- No se creó commit, PR, merge ni publicación.
