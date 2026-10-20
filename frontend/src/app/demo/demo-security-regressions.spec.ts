import { DemoAccessIntent } from './demo-access';
import { DemoContext, DemoScenario, decodeSnapshot, demoSeed } from './demo-model';
import { demoTestRuntime } from './demo-test-runtime';
import { DemoFulfillmentAction } from './demo-fulfillment';
import { DemoReturnReason } from './postsale/postsale-types';
import { DemoPostSaleWire } from './postsale/postsale-wire';
import { DemoScreen } from './demo-screen';
import { DemoDeliveryMethod, DemoPaymentMethod } from './demo-process-types';

function returnsAcrossOrders(secondBuyer: string) {
  let sequence = 0;
  const runtime = demoTestRuntime(demoSeed(), () => '2026-10-20T20:00:00Z', () => String(++sequence));
  for (const buyer of ['cliente', secondBuyer]) {
    runtime.sessionAsCustomer(buyer);
    runtime.add(buyer, 'DEMO-005', 1, 'DEMO-005:standard');
    const order = runtime.checkout(buyer, 'checkout-' + sequence, 'address-' + buyer, DemoScenario.Approved, DemoPaymentMethod.Card, DemoDeliveryMethod.Home);
    runtime.sessionAsAdmin();
    runtime.fulfill(order.id, DemoFulfillmentAction.Dispatch);
    runtime.fulfill(order.id, DemoFulfillmentAction.Deliver);
    runtime.sessionAsCustomer(buyer);
    runtime.postSale.request(buyer, 'return-' + sequence, order.id, [{ sku: 'DEMO-005', variantId: 'DEMO-005:standard', quantity: 1, reason: DemoReturnReason.Damaged }]);
  }
  return runtime;
}

describe('global return identity security boundary', () => {
  it.each(['cliente', 'cliente2'])('rejects duplicate RMA IDs across orders before validating any order: %s', buyer => {
    const runtime = returnsAcrossOrders(buyer);
    expect(() => decodeSnapshot(JSON.stringify(runtime.snapshot))).not.toThrow();
    const raw = JSON.parse(JSON.stringify(runtime.snapshot));
    raw.returns[1].id = raw.returns[0].id;
    const before = JSON.stringify(raw), sourceBefore = JSON.stringify(runtime.snapshot);
    const validate = vi.spyOn(DemoPostSaleWire, 'validateOrder');
    try {
      expect(() => decodeSnapshot(before)).toThrow('devolución duplicadas');
      expect(validate).not.toHaveBeenCalled();
      expect(JSON.stringify(raw)).toBe(before);
      expect(JSON.stringify(runtime.snapshot)).toBe(sourceBefore);
    } finally { validate.mockRestore(); }
  });

  it('fails closed on ambiguous command lookup, including buyer cancellation and admin decisions', () => {
    const runtime = returnsAcrossOrders('cliente2');
    runtime.snapshot.returns[1].id = runtime.snapshot.returns[0].id;
    const id = runtime.snapshot.returns[0].id, before = JSON.stringify(runtime.snapshot);
    runtime.sessionAsCustomer();
    expect(() => runtime.postSale.cancel('cliente', id)).toThrow('duplicadas');
    runtime.sessionAsAdmin();
    expect(() => runtime.postSale.decide('admin', id, true, 'Aprobación')).toThrow('duplicadas');
    expect(() => runtime.postSale.receive('admin', id)).toThrow('duplicadas');
    expect(() => runtime.postSale.refund('admin', id)).toThrow('duplicadas');
    expect(JSON.stringify(runtime.snapshot)).toBe(before);
  });
});

describe('closed navigation intent patterns', () => {
  it('accepts every eligible declared route and translates it to its closed screen', () => {
    for (const screen of DemoScreen.all) {
      if (screen === DemoScreen.Login || screen === DemoScreen.Register) continue;
      const path = '/demo' + (screen.path ? '/' + screen.path.replace(/:sku|:id|:orderId/g, 'DEMO-101') : '');
      expect(DemoAccessIntent.fromWire(path).screen).toBe(screen);
    }
  });
  it('preserves catalog, admin detail and marketplace without weakening roles or customer ownership', () => {
    const snapshot = demoSeed();
    expect(DemoAccessIntent.fromWire('/demo/catalog').destination(snapshot, 'cliente', DemoContext.Customer)).toBe('/demo/catalog');
    for (const path of ['/demo/user/orders/DEMO-101', '/demo/user/orders/DEMO-102', '/demo/user/mercadolibre']) {
      const intent = DemoAccessIntent.fromWire(path);
      expect(intent.destination(snapshot, 'admin', DemoContext.Admin)).toBe(path);
      expect(intent.destination(snapshot, 'cliente', DemoContext.Customer)).toBe('/demo');
      expect(intent.destination(snapshot, 'cliente', DemoContext.Admin)).toBe('/demo/user/home');
    }
    expect(DemoAccessIntent.fromWire('/demo/user/orders/missing').destination(snapshot, 'admin', DemoContext.Admin)).toBe('/demo/user/home');
    expect(DemoAccessIntent.fromWire('/demo/customer/orders/DEMO-101').destination(snapshot, 'cliente', DemoContext.Customer)).toBe('/demo/customer/orders/DEMO-101');
    expect(DemoAccessIntent.fromWire('/demo/customer/orders/DEMO-102').destination(snapshot, 'cliente', DemoContext.Customer)).toBe('/demo');
  });
  it.each(['/demo/user/arbitrary', '/demo/user/orders/DEMO-101/extra', '/demo/user/orders/../home', '/demo/user/orders/%2e%2e', '/demo/catalog?x=y', '/demo/user/mercadolibre#x', '/demo/login', '/demo/customer/register', '//demo/catalog', '/demo/catalog/', '/demo/user/orders/' + 'a'.repeat(129)])('rejects undeclared or malformed patterns: %s', path => {
    const intent = DemoAccessIntent.fromWire(path);
    expect(intent).toBe(DemoAccessIntent.Unknown);
    expect(intent.destination(demoSeed(), 'cliente', DemoContext.Customer)).toBe('/demo');
  });
});
