# Contrato de ejecución FE-COMP-01 → FE-COMP-02

Fecha: 2026-10-13. Estado: en ejecución; no acredita aceptación.

## Superficie inventariada de este corte

| Área | Ruta/demo screen | Controles o estado a verificar | Fixtures |
|---|---|---|---|
| Catálogo comprador | `/demo/user/catalog` | búsqueda, filtros, orden, detalle, stock/archivado | F01, F02 |
| Detalle | `/demo/catalog/:sku` | galería, zoom, alt, variante, cantidad, agregar | F02 |
| Carrito | `/demo/cart` | línea por variante, cantidades, eliminar, total | F01, F02 |
| Checkout | `/demo/checkout` | resumen actualizado y confirmación previa al pedido | F01, F02 |
| Catálogo admin | `/demo/user/catalog` | alta, edición, archivar, vista previa, validación | F02 |
| Pedidos comprador/admin | ambos detalles de pedido | snapshot histórico después de editar catálogo | F01, F02 |

El denominador de este corte son esos seis recorridos y sus controles condicionales,
incluidos bloqueos por stock, producto archivado y variante desconocida. Los demás
screens siguen en sus cortes FE-COMP-03..06.

## Propiedad y persistencia

`DemoCommerce` es el único propietario de las mutaciones del snapshot; `DemoState`
serializa persistencia y detecta revisión remota. La vista sólo emite intenciones.
La política de conflicto es conservadora: si antes de persistir cambió la revisión
almacenada por otra pestaña, se bloquea la escritura local, se informa el conflicto
y el usuario puede recargar el estado persistido. No hay last-write-wins silencioso.

El schema pasa de v1 a v2. La versión v1 no contiene una identidad estable por
variante ni imágenes/atributos congelados suficientes para migrarla sin adivinar;
por eso el borde la rechaza de forma explícita, explica el motivo y requiere que el
usuario confirme `Restablecer demo`. No se borra ni se cambia el estado
automáticamente.

## Evidencia pendiente

Antes del cierre se registrarán: hash, reset de fixture, actor, ruta, acción,
resultado antes/después, viewport 390/768/1440, captura y resultado de cada
recorrido J02. También se ejecutarán pruebas de dominio y build.
