# Spec funcional — continuidad de carrito y checkout

## Problema

Una persona anónima que intenta abrir `/cart` o `/checkout` es enviada al acceso
unificado, pero el destino se degrada a inicio. El enlace de registro también
descarta el destino y el alta siempre termina en perfil. Esto obliga a reconstruir
manualmente el recorrido de compra.

## Resultado esperado

1. `/cart` y `/checkout` son destinos cerrados, exclusivos de CUSTOMER.
2. El guard redirige a `/login?returnTo=CART|CHECKOUT`.
3. Login exitoso como CUSTOMER vuelve al destino solicitado.
4. Un contexto USER no puede consumir un destino CUSTOMER y cae a su home.
5. Login → registro → login conserva únicamente el destino cerrado.
6. Registro CUSTOMER exitoso invalida cualquier decisión de acceso previa, prueba
   autoritativamente la nueva sesión y su CSRF, selecciona CUSTOMER y recién
   entonces vuelve al destino. Si la prueba falla, no navega ni consume el destino;
   sin destino explícito mantiene el comportamiento de perfil.
7. Al abrir registro, una sesión CUSTOMER ya aceptada se detecta mediante el
   coordinador y ofrece continuar; nunca muestra un segundo formulario de alta.
   Si la inspección no puede determinar autoridad, ofrece reintentar y no habilita
   el formulario.
8. El retorno recarga el snapshot de carrito/direcciones desde backend. No ejecuta
   checkout ni mutaciones comerciales automáticamente.
9. Carrito vacío y dirección ausente se muestran con las lecturas existentes. Las
   validaciones comerciales vigentes se vuelven a aplicar al confirmar; refrescar
   precio o disponibilidad de una línea sin mutarla queda fuera de este corte.

## Seguridad y privacidad

- Solo se transporta el wire cerrado `CART` o `CHECKOUT`; nunca una URL externa.
- Hosts, esquemas, `//`, barras invertidas, encoding, query, fragment y rutas no
  registradas terminan en `Unknown`/home.
- No se guardan credenciales, tokens, direcciones, precios ni intentos de pago.
- El challenge conserva origen, nonce, vencimiento y consumo único existentes.

## Fuera de alcance

- Restaurar selección de producto/variante/cantidad.
- Carrito invitado o mezcla de carritos entre identidades.
- Confirmación automática de pedido o pago.
- Cambios en homologaciones externas.

## Criterios de aceptación

- Los tipos cerrados y sus traductores aceptan ambos destinos en TypeScript y
  Kotlin y rechazan valores desconocidos.
- La restricción de base admite ambos wires mediante migración nueva, sin editar
  `V11`.
- Guards, login, challenge y alta cubren CUSTOMER, USER y entradas hostiles.
- El alta cubre USER previamente activo, ambas sesiones, hint USER y fallo de probe
  sin navegar con autoridad local obsoleta.
- Una sesión CUSTOMER existente, activa o disponible junto a USER, nunca puede
  abrir un formulario de alta adicional.
- Un fallo de reconciliación posterior a un alta aceptada se puede reintentar sin
  repetir el POST de registro.
- El frontend no compara literales de estado/destino fuera del tipo cerrado.
- Gates completos de backend/frontend y E2E real verdes.
