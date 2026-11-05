# Plan de entrega

FE-COMP-01 establece inventario, fixtures, estados y gates con revisión documental Sol. **Implementar FE-COMP-02 primero**: sus identidades de línea/variante y snapshots son prerrequisito de postventa, inventario y ML. Después FE-COMP-03 y FE-COMP-04; FE-COMP-05 puede desarrollarse aislado con sus límites de navegación; FE-COMP-06 depende del inventario y las alertas. No editar simultáneamente el mismo store/snapshot entre agentes.

Cada corte produce commit/PR pequeño con contratos y traductor → comportamiento de dominio → pantallas/forms → pruebas y revisión. El PR especifica exactamente los escenarios E cubiertos y residuales. No merge automático ni promoción de runtime real por aprobación del demo. Revisiones sobre SHA final por Sol: funcional/código y UX/producto independientes; seguridad enfoca aislamiento, persistencia, identidad y datos externos.

G-D: documentos consistentes, requisitos/fixtures/dependencias trazados y revisión aprobada.
G-T: tipos/traductor, migración, invariantes y efectos idempotentes comprobados con pruebas significativas.
G-B: recorridos E del corte ejecutados en browser, datos antes/después, reload/back/deep link, duplicados/error/Unknown y separación de actor; cero solicitudes a APIs reales.
G-U: UX revisa capturas 390/768/1440, teclado/zoom, foco/dialogs, textos, jerarquía, estados vacíos/error, feedback y CTA; todos los hallazgos P1/P2 resueltos y re-revisados.
G-R: regresión del demo y build productivo, CI asociado al SHA final; fallos y NOT_RUN explícitos. Registrar hash/fecha/comando/resultado y artefacto, sin copiar PASS de otra rama.

Un corte queda aceptado solo con G-D/T/B/U/R; tener código o una captura no equivale a aceptado. Cierre global exige todos los cortes y walkthrough J02..J06 con inventario final calculado del runtime, controles deshabilitados justificados y todos los tabs recorridos. La homologación real mantiene gates independientes.
