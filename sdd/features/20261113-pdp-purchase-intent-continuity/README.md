# Continuidad de intención desde la ficha de producto

Este slice conserva, en la misma pestaña y durante 15 minutos, la selección
exacta de producto, variante y cantidad cuando un comprador debe autenticarse o
registrarse. La referencia propagada por el acceso es opaca y solo una sesión
CUSTOMER autoritativa puede reanudarla.

La vuelta a la ficha relee producto y carrito, no sustituye una variante ausente
y exige confirmar explícitamente la cantidad final. Nunca agrega al carrito de
forma automática. Un resultado de mutación ambiguo se reconcilia mediante una
lectura fresca, sin repetir el PUT a ciegas.

Entrega: PR #267, merge `c0595e5`. Verify del PR `43522541468` y post-merge
`43523386759`, ambos con backend, frontend y E2E real verdes.
