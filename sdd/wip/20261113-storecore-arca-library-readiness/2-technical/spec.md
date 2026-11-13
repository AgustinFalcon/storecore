# Especificación técnica — baseline consumible de ARCA

## Baseline verificada

| Atributo | Valor |
| --- | --- |
| Repositorio | `AgustinFalcon/arca-facturacion` |
| Commit | `8efeace434103e94f69ad1bce94a9d6dfe2cf7ec` |
| Coordenadas candidatas | `com.agusstkd.arca:*:0.1.0-RC.4` |
| Publicación comprobada | Maven local; no existe paquete remoto ni tag de release acreditado |
| CI post-merge | Verify `43366597624` y Security `43366597599`, ambos `success` |

## Contrato disponible

- `FiscalAuthorizationState` y eventos forman jerarquías selladas; `Unknown`
  falla cerrado.
- Emisión y conciliación exponen resultados sellados diferentes.
- `async-reference` aporta migración JDBC versionada, fingerprint/idempotencia,
  lease con token, transición optimista, lock por serie fiscal y outbox
  transaccional.
- Un lease de emisión vencido se reclama como conciliación, nunca como segundo
  despacho ciego.
- QR y PDF sólo aceptan un documento fiscal autorizado.

## Límite de adopción

StoreCore conserva la política de elegibilidad, la correlación con el pago y el
pedido, la configuración operativa, el scheduler y el despliegue. La biblioteca
no conoce Spring, pedidos, pagos, CUIT ni secretos reales. Antes de añadir una
dependencia se debe decidir:

1. matriz fiscal y política de emisión/rectificación;
2. origen oficial y durable que vuelve elegible la venta;
3. fórmulas de correlación y deduplicación StoreCore;
4. propiedad y atomicidad de inbox/intención/outbox;
5. retención, acceso y representación del comprobante;
6. distribución versionada del paquete y política de actualización.

## Diseño obligatorio del futuro adapter

El borde wire traduce una sola vez a tipos cerrados. La UI, el store y los tests
no comparan literales de estado. Cada paso del flujo —elegibilidad, persistencia,
despacho, conciliación y entrega— es un objeto con una responsabilidad y no
reescribe los pasos anteriores. El dominio fiscal no importa HTTP ni UI.

## Seguridad

Certificados, claves y tickets se obtienen de un proveedor de secretos por una
referencia opaca, separada por ambiente y emisor. Logs y evidencia excluyen
payloads sensibles y PII innecesaria. `PAUSED` detiene nuevos despachos pero no
abandona conciliaciones inciertas.
