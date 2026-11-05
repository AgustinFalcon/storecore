import type { DemoCatalogSnapshot } from './catalog-model';
import { OutletScope, ProductCondition, ProductPublication, VariantSaleState } from './catalog-types';

/** Explicit retained Demo unit: no availability or promotion is implied. */
export function addOutletFixture<T extends DemoCatalogSnapshot>(snapshot: T): T {
  if (snapshot.products.some(product => product.sku === 'VLD-043')) return snapshot;
  const media = [{ id: 'VLD-043-unit-reference', src: '/assets/demo/DEMO-004.svg', alt: 'Ilustración de unidad Outlet ficticia; no es fotografía de un artículo real' }];
  snapshot.products.push({ sku: 'VLD-043', name: 'VLD-043 · Unidad Outlet Demo', description: 'Unidad ficticia retenida, sin disponibilidad para venta.', brand: '', category: 'Outlet', price: 7190000, original: 9500000, onHand: 1, reserved: 0, publication: ProductPublication.Published, tone: '#a5b49b', variant: 'outlet-unit-01', attributes: [], media, variants: [{ id: 'outlet-unit-01', label: 'Unidad Outlet 01', price: 7190000, original: 9500000, onHand: 1, reserved: 0, notSellable: 1, saleState: VariantSaleState.Active, condition: ProductCondition.Outlet, attributes: [], outlet: { scope: OutletScope.Unit, reference: 'outlet-unit-01', notes: 'Ejemplar ficticio retenido para evaluación.', defects: 'Sin evaluación final; no habilitado para venta.', warrantyTerms: 'Condiciones pendientes de definir antes de habilitar venta.', media: media.map(item => ({ ...item })) } }] });
  return snapshot;
}
