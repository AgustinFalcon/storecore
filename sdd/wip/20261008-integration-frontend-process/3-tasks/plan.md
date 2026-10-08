# DAG de cortes

INT-FE-00 precede todo. INT-FE-01 corrige capability; INT-FE-02 depende de 01 y resuelve migración UA; INT-FE-03 depende de 02 y lleva frontend/#176. INT-FE-04 depende de 03 para CFE sobre sesiones reales. INT-FE-05 y 06 dependen de 03; INT-FE-07 reúne 04/05/06 y valida manifest, a11y y E2E real.

DAG canónico en [tasks.json](tasks.json). IDs INT-FE-00..07 pertenecen a este WIP y no reemplazan INT-FE-001..004 del WIP histórico frontend-slice-integration.

Cada corte se basa en el último head integrado y porta sólo archivos/hunks allowlisted; revalidar origen/destino y checksums antes de escribir. Tareas pendientes no tienen GO implícito por este documento. Ningún merge masivo master ni activación externa. Commit documental local no es merge, review ni cierre del producto.

## Sub-DAG INT-FE-03

Base documental exacta `b8bd49018413a503f5af8d04aa64b1dc36263f04`; backend local
INT-FE-02 no equivale a integrado/aceptado. Revalidar sus gates antes del port.

1. FE03-D: contrato/allowlist/interlock y A01–A09 para review (este corte).
2. FE03-T depende de D y GO: tipos cerrados, ports y mapper/API/cookies; unit A01/A02/A07.
3. FE03-C depende de T: coordinator y queue/CSRF, generaciones/revoke/cold logout;
   pruebas A03–A06 antes de conectar UI.
4. FE03-U depende de C: login/selector/homes/guards/shell y limpieza privada,
   preservando integración; A01/A03/A05/A07.
5. FE03-M depende de U: manifest exacto, axe/teclado/responsive, arquitectura,
   lint/unit/build; A08. No sustituye backend/browser.
6. FE03-R depende de M y entorno/gates INT-FE-02: runner UA-only aislado,
   A09 y componentes RealLocal A01–A07 con rate budget registrado.
7. FE03-E depende de R: evidencia por SHA/modo/Axx, regresiones capability y
   review del diff; no cierre si algún gate está NOT_RUN/BLOCKED.

Todos los subpasos de implementación están pendientes; D documentado para review.
INT-FE-04/05/06 no empiezan por completar D: dependen del corte FE03 aceptado.

## Sub-DAG INT-FE-04

Base exacta FE03 `41dcfb3ff099a4ca162c4c11fe75e4609826b1a8`; D documental
puede prepararse sin declarar aceptación FE03. Ver [contrato CFE](../4-implementation/int-fe04-commerce-fulfillment.md).

1. FE04-D: contrato, allowlist, decisiones de retorno y E01–E09 para review.
2. FE04-B depende de D/review y gates FE03: backend, elegibilidad/evidencia,
   transacciones, wire DTO y tests. Sin frontend que adelante autoridad.
3. FE04-T depende de B: extender tipos existentes, traductores y destinos cerrados.
4. FE04-U depende de T: consumers UI, interlock de actor/CSRF/ruta y pruebas UX.
5. FE04-E depende de U: aceptación E01–E09, regresiones, manifest/axe,
   RealLocal HTTPS/DB y evidencia/reviews por SHA.

Orden de PR D → B → T → U → E. B/T/U/E pendientes; ninguna prueba de producto
se ejecuta en D. Sin promoción master, live ni cierre por completar documentos.
