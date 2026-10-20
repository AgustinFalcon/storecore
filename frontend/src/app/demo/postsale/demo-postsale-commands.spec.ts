import { ShipmentStatus } from '../../domain/order/shipment-status';
import { OutletScope, ProductCondition, ProductPublication, VariantSaleState } from '../catalog/catalog-types';
import { DemoReturnAccounting, DemoReturnDisposition, DemoReturnInspectionResult, DemoReturnReason, DemoReturnStatus } from './postsale-types';
import { DemoReturnPolicy } from './return-policy';
import { postSaleFixture } from './postsale-test-fixture';

describe('DemoPostSaleCommands', () => {
  const selection = (line: { sku: string; variantId: string }, quantity = 1) => [{ sku: line.sku, variantId: line.variantId, quantity, reason: DemoReturnReason.Damaged }];

  it('requires an owned paid delivered order and explicit known selections', () => {
    const fixture = postSaleFixture();
    const line = fixture.order.lines[0];
    fixture.order.shipment = ShipmentStatus.Shipped;
    expect(() => fixture.commands.request('customer', 'command-1', fixture.order.id, selection(line))).toThrow('entregado');
    fixture.order.shipment = ShipmentStatus.Delivered;
    expect(() => fixture.commands.request('foreign', 'command-1', fixture.order.id, selection(line))).toThrow('permiso');
    expect(() => fixture.commands.request('customer', 'command-1', fixture.order.id, [{ sku: line.sku, variantId: line.variantId, quantity: 1, reason: DemoReturnReason.Unknown }])).toThrow('motivo');
    expect(fixture.snapshot.returns).toHaveLength(0);
  });

  it('deduplicates one command and rejects a reused key with another payload', () => {
    const fixture = postSaleFixture();
    const line = fixture.order.lines[0];
    const first = fixture.commands.request('customer', 'same-command', fixture.order.id, selection(line));
    const revision = fixture.snapshot.revision;
    expect(fixture.commands.request('customer', 'same-command', fixture.order.id, selection(line))).toBe(first);
    expect(fixture.snapshot.revision).toBe(revision);
    expect(() => fixture.commands.request('customer', 'same-command', fixture.order.id, selection(line, 2))).toThrow('otros datos');
  });

  it('uses sku plus variantId when availability, dedupe and requested lines share a variant id', () => {
    const fixture = postSaleFixture();
    const first = fixture.order.lines[0];
    const secondProduct = { ...fixture.product, sku: 'OTHER-SKU', name: 'Otro producto', variants: fixture.product.variants.map(variant => ({ ...variant })) };
    fixture.snapshot.products.push(secondProduct);
    const second = { ...first, sku: 'OTHER-SKU', name: 'Otro producto', quantity: 1 };
    fixture.order.lines.push(second);
    fixture.order.total += second.unit;
    const request = fixture.commands.request('customer', 'composite-lines', fixture.order.id, [
      { sku: first.sku, variantId: first.variantId, quantity: 2, reason: DemoReturnReason.Damaged },
      { sku: second.sku, variantId: second.variantId, quantity: 1, reason: DemoReturnReason.Defective },
    ]);
    expect(request.lines.map(line => `${line.sku}:${line.variantId}`)).toEqual([`${first.sku}:${first.variantId}`, `${second.sku}:${second.variantId}`]);
    const policy = new DemoReturnPolicy();
    expect(policy.available(fixture.order, fixture.snapshot.returns, first.sku, first.variantId)).toBe(1);
    expect(policy.available(fixture.order, fixture.snapshot.returns, second.sku, second.variantId)).toBe(0);
    fixture.commands.decide('admin', request.id, true, 'Autorizada');
    fixture.commands.receive('admin', request.id);
    fixture.commands.inspect('admin', request.id, 'Ambos productos identificados', DemoReturnInspectionResult.Complete);
    const firstStock = fixture.catalog.variant(first.sku, first.variantId).onHand;
    const secondStock = fixture.catalog.variant(second.sku, second.variantId).onHand;
    fixture.commands.dispose('admin', request.id, [
      { sku: first.sku, variantId: first.variantId, disposition: DemoReturnDisposition.Restock },
      { sku: second.sku, variantId: second.variantId, disposition: DemoReturnDisposition.Restock },
    ]);
    expect(fixture.catalog.variant(first.sku, first.variantId).onHand).toBe(firstStock + 2);
    expect(fixture.catalog.variant(second.sku, second.variantId).onHand).toBe(secondStock + 1);
  });

  it('reserves only eligible quantities and releases them when cancelled or rejected', () => {
    const fixture = postSaleFixture();
    const line = fixture.order.lines[0];
    const policy = new DemoReturnPolicy();
    const cancelled = fixture.commands.request('customer', 'cancel', fixture.order.id, selection(line, 2));
    expect(policy.available(fixture.order, fixture.snapshot.returns, line.sku, line.variantId)).toBe(1);
    fixture.commands.cancel('customer', cancelled.id);
    fixture.commands.cancel('customer', cancelled.id);
    expect(policy.available(fixture.order, fixture.snapshot.returns, line.sku, line.variantId)).toBe(3);
    const rejected = fixture.commands.request('customer', 'reject', fixture.order.id, selection(line, 3));
    fixture.commands.decide('admin', rejected.id, false, 'Fuera de política');
    expect(policy.available(fixture.order, fixture.snapshot.returns, line.sku, line.variantId)).toBe(3);
  });

  it('keeps receive, inspect, disposition and refund as distinct guarded steps', () => {
    const fixture = postSaleFixture();
    const line = fixture.order.lines[0];
    const request = fixture.commands.request('customer', 'steps', fixture.order.id, selection(line));
    expect(() => fixture.commands.receive('admin', request.id)).toThrow('aprobada');
    fixture.commands.decide('admin', request.id, true, 'Autorizada');
    fixture.commands.receive('admin', request.id);
    expect(request.status).toBe(DemoReturnStatus.Received);
    expect(() => fixture.commands.dispose('admin', request.id, [{ sku: line.sku, variantId: line.variantId, disposition: DemoReturnDisposition.Restock }])).toThrow('inspección completa');
    fixture.commands.inspect('admin', request.id, 'Completa y sin faltantes', DemoReturnInspectionResult.Complete);
    expect(request.status).toBe(DemoReturnStatus.Inspected);
    expect(() => fixture.commands.refund('admin', request.id)).toThrow('disposición');
  });

  it('keeps NeedsReview in reception and requires a later complete inspection', () => {
    const fixture = postSaleFixture();
    const line = fixture.order.lines[0];
    const request = fixture.commands.request('customer', 'reinspection', fixture.order.id, selection(line));
    fixture.commands.decide('admin', request.id, true, 'Autorizada');
    fixture.commands.receive('admin', request.id);
    fixture.commands.inspect('admin', request.id, 'Falta verificar el número de serie', DemoReturnInspectionResult.NeedsReview);
    expect(request.status).toBe(DemoReturnStatus.Received);
    expect(() => fixture.commands.dispose('admin', request.id, [{ sku: line.sku, variantId: line.variantId, disposition: DemoReturnDisposition.Restock }])).toThrow('inspección completa');
    expect(() => fixture.commands.inspect('admin', request.id, 'No usar', DemoReturnInspectionResult.Unknown)).toThrow('resultado');
    fixture.commands.inspect('admin', request.id, 'Número de serie validado', DemoReturnInspectionResult.Complete);
    expect(request.status).toBe(DemoReturnStatus.Inspected);
  });

  it('identifies every effective inspection event and ignores an identical retry', () => {
    const fixture = postSaleFixture();
    const request = fixture.commands.request('customer', 'inspection-events', fixture.order.id, selection(fixture.order.lines[0]));
    fixture.commands.decide('admin', request.id, true, 'Autorizada');
    fixture.commands.receive('admin', request.id);
    const receptionAlert = fixture.snapshot.postSaleAlerts.at(-1)!;
    fixture.commands.inspect('admin', request.id, 'Falta validar serie', DemoReturnInspectionResult.NeedsReview);
    const firstAlert = fixture.snapshot.postSaleAlerts.at(-1)!;
    expect(firstAlert.id).not.toBe(receptionAlert.id);
    const revision = fixture.snapshot.revision;
    fixture.commands.inspect('admin', request.id, 'Falta validar serie', DemoReturnInspectionResult.NeedsReview);
    expect(fixture.snapshot.revision).toBe(revision);
    expect(fixture.snapshot.postSaleAlerts.at(-1)).toBe(firstAlert);
    fixture.commands.inspect('admin', request.id, 'Serie validada; falta probar accesorios', DemoReturnInspectionResult.NeedsReview);
    const secondAlert = fixture.snapshot.postSaleAlerts.at(-1)!;
    expect(secondAlert.id).not.toBe(firstAlert.id);
    expect(firstAlert.id).toContain('-inspected-');
    expect(secondAlert.id).toContain('-inspected-');
  });

  it('restocks sellable and records damaged physical units without increasing availability', () => {
    const fixture = postSaleFixture();
    const [sellable, damaged] = fixture.order.lines;
    const request = fixture.commands.request('customer', 'mixed', fixture.order.id, [
      { sku: sellable.sku, variantId: sellable.variantId, quantity: 1, reason: DemoReturnReason.ChangedMind },
      { sku: damaged.sku, variantId: damaged.variantId, quantity: 1, reason: DemoReturnReason.Defective },
    ]);
    fixture.commands.decide('admin', request.id, true, 'Autorizada');
    fixture.commands.receive('admin', request.id);
    fixture.commands.inspect('admin', request.id, 'Ambas unidades revisadas', DemoReturnInspectionResult.Complete);
    const sellableBefore = fixture.catalog.available(sellable.sku, sellable.variantId);
    const damagedBefore = fixture.catalog.available(damaged.sku, damaged.variantId);
    fixture.commands.dispose('admin', request.id, [
      { sku: sellable.sku, variantId: sellable.variantId, disposition: DemoReturnDisposition.Restock },
      { sku: damaged.sku, variantId: damaged.variantId, disposition: DemoReturnDisposition.Damaged },
    ]);
    const revision = fixture.snapshot.revision;
    fixture.commands.dispose('admin', request.id, [
      { sku: sellable.sku, variantId: sellable.variantId, disposition: DemoReturnDisposition.Restock },
      { sku: damaged.sku, variantId: damaged.variantId, disposition: DemoReturnDisposition.Damaged },
    ]);
    expect(fixture.snapshot.revision).toBe(revision);
    expect(fixture.catalog.available(sellable.sku, sellable.variantId)).toBe(sellableBefore + 1);
    expect(fixture.catalog.available(damaged.sku, damaged.variantId)).toBe(damagedBefore);
    expect(request.lines.map(line => line.accounting)).toEqual([DemoReturnAccounting.Sellable, DemoReturnAccounting.Damaged]);
  });

  it('refunds merchandise once, excludes shipping and preserves the original order total', () => {
    const fixture = postSaleFixture();
    const line = fixture.order.lines[0];
    const originalTotal = fixture.order.total;
    const request = fixture.commands.request('customer', 'refund', fixture.order.id, selection(line, 2));
    fixture.commands.decide('admin', request.id, true, 'Autorizada');
    fixture.commands.receive('admin', request.id);
    fixture.commands.inspect('admin', request.id, 'Completa', DemoReturnInspectionResult.Complete);
    fixture.commands.dispose('admin', request.id, [{ sku: line.sku, variantId: line.variantId, disposition: DemoReturnDisposition.Restock }]);
    fixture.commands.refund('admin', request.id);
    const snapshot = JSON.stringify(fixture.snapshot);
    fixture.commands.refund('admin', request.id);
    expect(JSON.stringify(fixture.snapshot)).toBe(snapshot);
    expect(request.refundedAmount).toBe(line.unit * 2);
    expect(request.refundId).toBe(`SIM-REFUND-${request.id}`);
    expect(fixture.order.total).toBe(originalTotal);
    expect(new DemoReturnPolicy().refundStatus(fixture.order, fixture.snapshot.returns).label).toBe('Reembolso parcial');
  });

  it('validates the full disposition before any stock mutation and enforces admin authority', () => {
    const fixture = postSaleFixture();
    const [first, second] = fixture.order.lines;
    const request = fixture.commands.request('customer', 'atomic', fixture.order.id, [
      { sku: first.sku, variantId: first.variantId, quantity: 1, reason: DemoReturnReason.Damaged },
      { sku: second.sku, variantId: second.variantId, quantity: 1, reason: DemoReturnReason.Defective },
    ]);
    fixture.commands.decide('admin', request.id, true, 'Autorizada');
    fixture.commands.receive('admin', request.id);
    fixture.commands.inspect('admin', request.id, 'Completa', DemoReturnInspectionResult.Complete);
    const before = JSON.stringify(fixture.snapshot);
    expect(() => fixture.commands.dispose('customer', request.id, [])).toThrow('administrativo');
    expect(() => fixture.commands.dispose('admin', request.id, [{ sku: first.sku, variantId: first.variantId, disposition: DemoReturnDisposition.Restock }])).toThrow('cada producto');
    expect(JSON.stringify(fixture.snapshot)).toBe(before);
  });

  it('blocks disposal atomically when the product or returned variant has an Unknown catalog type', () => {
    const corruptions = [
      (fixture: ReturnType<typeof postSaleFixture>) => { fixture.product.publication = ProductPublication.Unknown; },
      (fixture: ReturnType<typeof postSaleFixture>) => { fixture.product.variants[0].saleState = VariantSaleState.Unknown; },
      (fixture: ReturnType<typeof postSaleFixture>) => { fixture.product.variants[0].condition = ProductCondition.Unknown; },
      (fixture: ReturnType<typeof postSaleFixture>) => {
        fixture.product.variants[0].condition = ProductCondition.Outlet;
        fixture.product.variants[0].outlet = {
          scope: OutletScope.Unknown,
          reference: 'unknown-scope',
          notes: 'Pendiente',
          defects: 'Pendiente',
          warrantyTerms: 'Pendiente',
          media: fixture.product.media.map(value => ({ ...value })),
        };
      },
    ];
    for (const [index, corrupt] of corruptions.entries()) {
      const fixture = postSaleFixture();
      const line = fixture.order.lines[0];
      const request = fixture.commands.request('customer', `unknown-catalog-${index}`, fixture.order.id, selection(line));
      fixture.commands.decide('admin', request.id, true, 'Autorizada');
      fixture.commands.receive('admin', request.id);
      fixture.commands.inspect('admin', request.id, 'Completa', DemoReturnInspectionResult.Complete);
      corrupt(fixture);
      const before = JSON.stringify(fixture.snapshot);
      expect(() => fixture.commands.dispose('admin', request.id, [{ sku: line.sku, variantId: line.variantId, disposition: DemoReturnDisposition.Restock }])).toThrow('conciliación');
      expect(JSON.stringify(fixture.snapshot)).toBe(before);
      expect(request.status).toBe(DemoReturnStatus.Inspected);
      expect(request.lines[0].accounting).toBe(DemoReturnAccounting.NotRecorded);
    }
  });

  it('accepts an identical disposal replay before consulting a catalog entry deleted after success', () => {
    const fixture = postSaleFixture();
    const line = fixture.order.lines[0];
    const request = fixture.commands.request('customer', 'replay-without-catalog', fixture.order.id, selection(line));
    fixture.commands.decide('admin', request.id, true, 'Autorizada');
    fixture.commands.receive('admin', request.id);
    fixture.commands.inspect('admin', request.id, 'Completa', DemoReturnInspectionResult.Complete);
    const outcome = [{ sku: line.sku, variantId: line.variantId, disposition: DemoReturnDisposition.Restock }];
    fixture.commands.dispose('admin', request.id, outcome);
    const revision = fixture.snapshot.revision;
    const movements = fixture.snapshot.movements.length;
    const alerts = fixture.snapshot.postSaleAlerts.length;
    fixture.product.variants = fixture.product.variants.filter(value => value.id !== line.variantId);
    expect(() => fixture.commands.dispose('admin', request.id, outcome)).not.toThrow();
    expect(fixture.snapshot.revision).toBe(revision);
    expect(fixture.snapshot.movements).toHaveLength(movements);
    expect(fixture.snapshot.postSaleAlerts).toHaveLength(alerts);
  });

  it('rejects an Outlet unit restock whose projected stock would exceed its closed scope', () => {
    const fixture = postSaleFixture();
    const line = fixture.order.lines[0];
    const variant = fixture.catalog.variant(line.sku, line.variantId);
    variant.onHand = 1;
    variant.reserved = 0;
    variant.notSellable = 0;
    variant.condition = ProductCondition.Outlet;
    variant.outlet = {
      scope: OutletScope.Unit,
      reference: 'outlet-unit-1',
      notes: 'Unidad identificada',
      defects: 'Caja marcada',
      warrantyTerms: 'Garantía reducida',
      media: fixture.product.media.map(value => ({ ...value })),
    };
    fixture.catalog.refreshTotals(fixture.product);
    const request = fixture.commands.request('customer', 'outlet-overflow', fixture.order.id, selection(line));
    fixture.commands.decide('admin', request.id, true, 'Autorizada');
    fixture.commands.receive('admin', request.id);
    fixture.commands.inspect('admin', request.id, 'Completa', DemoReturnInspectionResult.Complete);
    const before = JSON.stringify(fixture.snapshot);
    expect(() => fixture.commands.dispose('admin', request.id, [{ sku: line.sku, variantId: line.variantId, disposition: DemoReturnDisposition.Restock }])).toThrow('Outlet requiere');
    expect(JSON.stringify(fixture.snapshot)).toBe(before);
    expect(request.status).toBe(DemoReturnStatus.Inspected);
  });

  it('prevalidates every projected product in a multi-line disposal without partial stock effects', () => {
    const fixture = postSaleFixture();
    const [first, second] = fixture.order.lines;
    const invalid = fixture.catalog.variant(second.sku, second.variantId);
    invalid.onHand = 1;
    invalid.reserved = 0;
    invalid.notSellable = 0;
    invalid.condition = ProductCondition.Outlet;
    invalid.outlet = {
      scope: OutletScope.Unit,
      reference: 'outlet-unit-2',
      notes: 'Unidad identificada',
      defects: 'Carcasa marcada',
      warrantyTerms: 'Garantía reducida',
      media: fixture.product.media.map(value => ({ ...value })),
    };
    fixture.catalog.refreshTotals(fixture.product);
    const request = fixture.commands.request('customer', 'atomic-projection', fixture.order.id, [
      { sku: first.sku, variantId: first.variantId, quantity: 1, reason: DemoReturnReason.ChangedMind },
      { sku: second.sku, variantId: second.variantId, quantity: 1, reason: DemoReturnReason.Defective },
    ]);
    fixture.commands.decide('admin', request.id, true, 'Autorizada');
    fixture.commands.receive('admin', request.id);
    fixture.commands.inspect('admin', request.id, 'Completa', DemoReturnInspectionResult.Complete);
    const before = JSON.stringify(fixture.snapshot);
    expect(() => fixture.commands.dispose('admin', request.id, [
      { sku: first.sku, variantId: first.variantId, disposition: DemoReturnDisposition.Restock },
      { sku: second.sku, variantId: second.variantId, disposition: DemoReturnDisposition.Restock },
    ])).toThrow('Outlet requiere');
    expect(JSON.stringify(fixture.snapshot)).toBe(before);
    expect(request.status).toBe(DemoReturnStatus.Inspected);
    expect(request.lines.every(value => value.accounting === DemoReturnAccounting.NotRecorded)).toBe(true);
  });

  it('fails closed for Unknown states instead of treating raw strings as valid', () => {
    const fixture = postSaleFixture();
    const request = fixture.commands.request('customer', 'unknown', fixture.order.id, selection(fixture.order.lines[0]));
    request.status = DemoReturnStatus.Unknown;
    expect(() => fixture.commands.decide('admin', request.id, true, 'Autorizada')).toThrow('no disponible');
  });
});
