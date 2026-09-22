# Especificación técnica — Discovery fiscal ARCA

**Status:** `documented_deferred` · **Fecha:** 2026-09-21

## Boundary

```text
arca-facturacion-core → modelos fiscales inmutables + ports de autoridad
StoreCore fiscal adapter → instalación/emisor/política → intención/documento/outbox/auditoría
```

El core no conoce orden, pago, instalación, Spring, JPA, Mercado Pago ni secretos. El adapter se vincula a un merchant/emisor de una única instalación; no usa `store_id`, claves tenant-aware ni consultas cross-client. Certificados/tokens se resuelven por referencia opaca a secret store aprobado.

## Invariantes

- Servicio ARCA, WSDL/manual, comprobante, punto de venta y política derivan de D-01..D-07, nunca de supuestos.
- Intento, request/response redactados, autorización, CAE/CAEA, vencimiento, número, QR, catálogo y error se auditan separadamente.
- Timeout ambiguo se reconcilia antes de reintentar; rechazo no es retry ciego.
- Documento autorizado es inmutable; refund/chargeback puede originar NC/ND sólo tras política D-06.
- El adapter sólo soporta cumplimiento del titular. No contiene modo de evasión/ocultamiento/bypass.

## Gates

Pruebas futuras: fixtures sintéticos, workers duplicados, timeout/reconciliación, rechazo, QR determinista y rectificativo. No hay endpoint, DDL ni emisión productiva antes de matriz validada y Sol GO.
