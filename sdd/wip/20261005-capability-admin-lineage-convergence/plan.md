# Plan de ejecución

1. Revalidar heads y confirmar que V10/V20 continúan libres.
2. Obtener inventario de cada instalación soportada; detenerse si hay historial ambiguo.
3. Implementar un solo corte por linaje, con migración, caller y pruebas en el mismo PR.
4. Ejecutar pruebas de upgrade, ACL efectiva y runtime negativo; no aceptar sólo inspección de grants.
5. Pasar revisión Astra y Sol sobre el SHA exacto, corregir hallazgos y repetir CI.
6. Recién con ambos linajes verdes, preparar un PR de promoción allowlisted. El PR #162 no se mergea como agregado.

BlackStore #28 queda como procedencia histórica: sus simulaciones shipping/billing y capturas requieren cortes SDD independientes, con contratos reales y tipos cerrados, antes de cualquier homologación.
