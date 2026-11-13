# Progreso — continuidad de carrito y checkout

## 2026-11-13

- Auditoría funcional/técnica coordinada: P2 confirmado; no hay open redirect ni
  P0/P1 en el comportamiento actual.
- El contrato v1 excluye deliberadamente carrito, checkout y detalles; el cambio es
  una ampliación, no una regresión.
- Un cambio solo frontend sería incorrecto: el backend devuelve el destino final y
  `V11` restringe los wires persistibles.
- Decisión de corte: entregar primero los destinos fijos CART/CHECKOUT y registro;
  la selección parametrizada de producto va en un SDD posterior para no mezclar
  navegación con mutaciones comerciales.
- Estado: specs preparados para revisión.
- Review técnica detectó que `RegisterCustomerUseCase` solo marcaba autoridad local
  y que el coordinador podía conservar un USER activo. El spec ahora exige una
  reconciliación autoritativa explícita, selección CUSTOMER y fail-closed antes de
  navegar.
- Review funcional corrigió una promesa inexistente de repricing/stock en lectura:
  el corte recarga el snapshot servidor y conserva validaciones al confirmar. La
  reconciliación fallida se reintenta sin repetir el alta.
- Review de código encontró dos fugas de autoridad visual: el boolean local podía
  mostrar Continuar antes del probe y una sesión CUSTOMER existente veía un segundo
  formulario. Se corrigieron con etapas cerradas, inspección coordinada y vistas
  exclusivas para captura, espera, reintento y completado.
- La inspección previa al alta distingue con un tipo cerrado `Accepted`, `Absent`
  y `Unavailable`: solo una ausencia CUSTOMER confirmada habilita captura. Un 503,
  respuesta desconocida o probe supersedido queda fail-closed y conserva cualquier
  sesión USER aceptada.
- Evidencia focal frontend: 3 archivos y 60 pruebas verdes para coordinador,
  pasos/store de registro y vista.
- Gate frontend completo: arquitectura, lint, 196 archivos / 1323 pruebas y build
  de producción verdes.
- Backend focal de migraciones: upgrades históricos y esquema limpio llegan a V20.
- Gate backend completo: 83 suites / 413 pruebas, 0 fallos, 0 errores y 0 omitidas.
- La revisión coordinada descubrió una carrera durante logout CUSTOMER: la
  inspección podía rehabilitar autoridad mientras el POST de revocación seguía
  pendiente. Ahora respeta `pendingRevocations`, la barrera de mutación y la
  revisión del realm, y una prueba impide emitir `/me` durante la revocación.
- Revisión final coordinada GPT-6.1 Sol: APPROVE funcional y APPROVE
  técnico/seguridad; sin hallazgos P0-P3 restantes.
